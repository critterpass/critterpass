/**
 * One guide turn as a stream of wire events: stream the model, run the tools it calls through the
 * registry (at most `maxToolRounds` rounds, then one last answer with tools off), and settle the
 * meter exactly once: commit when `done` is sent, release on failure, refusal or a client that
 * left. Every model call goes through the gateway, so each round writes its own usage row. The
 * turn never throws: failures become one `error{code}` event with the gateway's taxonomy.
 *
 * Input screening: the caller starts the `guide_input` compliance check before its context build
 * and passes it as `inputCheck`. The turn waits for it at most `inputCheckBudgetMs` before the
 * first model call, so it adds almost nothing to the turn. A verdict in time decides the tools up
 * front; a late one still gates every write tool: the first write call waits for the verdict, and
 * once injection is flagged write calls are refused and later rounds carry read tools only. A
 * self-harm or violence flag adds the Help safety card before `done`. The question is never
 * blocked.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { guideInputActions, type AiRoute, type ComplianceResult } from '@cp/domain';

import type { Gateway } from '../client';
import { toGatewayError } from '../errors';
import { resolveRoute } from '../routing';
import {
  collectCitedGrounding,
  collectGrounding,
  collectToolGrounding,
  mergeGrounding,
  unverifiedTextNumbers,
  type GroundingViolation,
} from '../tools/grounding';
import {
  routeTools,
  toolFailure,
  type ToolContext,
  type ToolRegistry,
  type ToolRunResult,
} from '../tools/registry';
import { searchFirst, webSources } from '../tools/web-search';
import type { UsageContext } from '../usage';
import {
  DEFAULT_INPUT_CHECK_BUDGET_MS,
  INPUT_VERDICT_WAIT_MS,
  isWriteTool,
  toolName,
  watchInput,
  within,
} from './input-screen';
import { BRIEF_ANSWER_DIRECTIVE, degradedRoute, settleOnce, type MeterHandle } from './meter';
import type { ToolCard, TurnEvent } from './sse';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlock = Anthropic.Messages.ContentBlock;

export interface RunTurnInput {
  readonly route: AiRoute;
  readonly system: readonly Anthropic.Messages.TextBlockParam[];
  readonly messages: readonly MessageParam[];
  readonly tool: Omit<ToolContext, 'route' | 'signal'>;
  readonly usage?: UsageContext;
  /** Rows the answer may quote besides tool output (trip context, engine values). */
  readonly groundingSources?: readonly unknown[];
  readonly signal?: AbortSignal;
  /** Tool rounds before the final answer; chat surfaces use the default of 3. */
  readonly maxToolRounds?: number;
  /** The `guide_input` compliance check of the asker's text, started before the context build. */
  readonly inputCheck?: Promise<ComplianceResult>;
  /** How long the first model call waits for `inputCheck` (default 25 ms). */
  readonly inputCheckBudgetMs?: number;
}

export interface TurnHooks {
  readonly onToolResult?: (result: ToolRunResult) => void;
  readonly onGroundingFlags?: (violations: readonly GroundingViolation[]) => void;
  readonly onSettled?: (outcome: 'committed' | 'released', cause?: unknown) => void;
  /** The input check's verdict, once known (flags are logged by the caller). */
  readonly onInputScreened?: (result: ComplianceResult) => void;
}

export interface RunTurnDeps {
  readonly gateway: Gateway;
  readonly registry: ToolRegistry;
  readonly meter: MeterHandle;
  readonly hooks?: TurnHooks;
}

export const DEFAULT_TOOL_ROUNDS = 3;
function streamEvent(event: Anthropic.Messages.RawMessageStreamEvent): TurnEvent | undefined {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    return { type: 'token', text: event.delta.text };
  }
  if (event.type === 'content_block_start') {
    const block = event.content_block;
    if (block.type === 'tool_use') {
      return { type: 'tool_start', tool: block.name, id: block.id };
    }
  }
  return undefined;
}

function isEmpty(output: unknown): boolean {
  if (Array.isArray(output)) return output.length === 0;
  if (output !== null && typeof output === 'object') {
    const values = Object.values(output);
    return values.length > 0 && values.every((value) => Array.isArray(value) && value.length === 0);
  }
  return false;
}

function toolCard(result: ToolRunResult): ToolCard {
  if (!result.ok) return { tool: result.name, status: 'unavailable' };
  if (isEmpty(result.output)) return { tool: result.name, status: 'no_data' };
  return { tool: result.name, status: 'ok', data: result.output };
}

/** Prepends a directive to the latest user turn (earlier turns stay byte-identical). */
function withDirective(messages: readonly MessageParam[], directive: string): MessageParam[] {
  const last = messages.findLastIndex((m) => m.role === 'user');
  return messages.map((message, index) => {
    if (index !== last) return message;
    const content =
      typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : message.content;
    return { role: 'user', content: [{ type: 'text', text: directive }, ...content] };
  });
}

/** Response blocks go back to the API verbatim (thinking blocks must round-trip with tool calls). */
function asParams(content: readonly ContentBlock[]): Anthropic.Messages.ContentBlockParam[] {
  return content as unknown as Anthropic.Messages.ContentBlockParam[];
}

const textOf = (content: readonly ContentBlock[]): string =>
  content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');

export async function* runTurn(
  input: RunTurnInput,
  deps: RunTurnDeps,
): AsyncGenerator<TurnEvent, void, undefined> {
  const meter = settleOnce(deps.meter);
  const hooks = deps.hooks ?? {};
  let settled = false;
  const release = async (cause?: unknown): Promise<void> => {
    if (settled) return;
    settled = true;
    await meter.release();
    hooks.onSettled?.('released', cause);
  };

  try {
    const { reservation } = meter;
    if (reservation.fairUse === 'busy') {
      await release('fair_use_busy');
      yield { type: 'error', code: 'FAIR_USE_SLOWDOWN', retryable: true };
      return;
    }
    const degraded = reservation.fairUse === 'degrade_haiku';
    const routeId = degraded ? degradedRoute(input.route) : input.route;
    const route = resolveRoute(routeId);
    const allTools = routeTools(route);
    const screen = watchInput(input.inputCheck, (result) => hooks.onInputScreened?.(result));
    await within(screen.settled, input.inputCheckBudgetMs ?? DEFAULT_INPUT_CHECK_BUDGET_MS);
    const readOnly = () =>
      screen.current !== undefined && guideInputActions(screen.current).readOnlyTools;
    let messages = degraded
      ? withDirective(input.messages, BRIEF_ANSWER_DIRECTIVE)
      : [...input.messages];
    const maxRounds = input.maxToolRounds ?? DEFAULT_TOOL_ROUNDS;
    const first = searchFirst(route);
    const outputs: { readonly name: string; readonly output: unknown }[] = [];
    let finalText = '';

    for (let round = 0; ; round += 1) {
      const lastRound = round >= maxRounds;
      let message: Anthropic.Messages.Message | undefined;
      const tools = readOnly() ? allTools.filter((tool) => !isWriteTool(toolName(tool))) : allTools;
      const stream = deps.gateway.streamModel(
        routeId,
        {
          system: input.system,
          messages,
          ...(tools.length === 0 ? {} : { tools }),
          ...(lastRound && tools.length > 0 ? { toolChoice: { type: 'none' } as const } : {}),
          ...(round === 0 && !lastRound && first !== undefined ? { toolChoice: first } : {}),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        },
        input.usage ?? {},
      );
      for await (const part of stream) {
        if (part.kind === 'done') {
          message = part.result.message;
        } else {
          const event = streamEvent(part.event);
          if (event !== undefined) yield event;
        }
      }
      if (message === undefined) throw new Error('model stream ended without a message');

      if (message.stop_reason !== 'tool_use' || lastRound) {
        finalText = textOf(message.content);
        break;
      }

      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of message.content) {
        if (block.type !== 'tool_use') continue;
        const call = { id: block.id, name: block.name, input: block.input };
        // A write tool never runs before the input verdict is known.
        if (isWriteTool(block.name) && screen.current === undefined) {
          await within(screen.settled, INPUT_VERDICT_WAIT_MS);
        }
        const result =
          readOnly() && isWriteTool(block.name)
            ? toolFailure(call, 'TOOL_NOT_ALLOWED')
            : await deps.registry.execute(call, {
                ...input.tool,
                route: routeId,
                ...(input.signal === undefined ? {} : { signal: input.signal }),
              });
        hooks.onToolResult?.(result);
        results.push(result.block);
        yield { type: 'tool_result', id: block.id, card: toolCard(result) };
        if (result.ok) {
          outputs.push({ name: result.name, output: result.output });
          if (result.name === 'propose_plan_changes') {
            const { changeset_id } = result.output as { changeset_id: string };
            yield { type: 'proposal', changeset_id };
          }
        }
      }
      messages = [
        ...messages,
        { role: 'assistant', content: asParams(message.content) },
        { role: 'user', content: results },
      ];
    }

    // Web results ground chat text only (cite-only), never structured output.
    const grounding = mergeGrounding(
      collectToolGrounding(outputs),
      collectCitedGrounding(outputs),
      collectGrounding(input.groundingSources ?? []),
    );
    const flags = unverifiedTextNumbers(finalText, grounding);
    if (flags.length > 0) hooks.onGroundingFlags?.(flags);
    if (screen.current === undefined) await within(screen.settled, INPUT_VERDICT_WAIT_MS);
    if (screen.current !== undefined && guideInputActions(screen.current).safetyCard) {
      yield { type: 'help_card', topic: 'safety' };
    }

    settled = true;
    const settlement = await meter.commit();
    hooks.onSettled?.('committed');
    if (settlement.usage !== null) yield { type: 'usage', ...settlement.usage };
    yield { type: 'done', ai_generated: true, sources: webSources(outputs) };
  } catch (error) {
    await release(error);
    // A client that left gets no error frame; everything else ends on one.
    if (input.signal?.aborted === true) return;
    const failure = toGatewayError(error);
    yield { type: 'error', code: failure.code, retryable: failure.retryable };
  } finally {
    // Reached without settling only when the consumer stopped reading (client disconnect).
    await release('client_disconnected');
  }
}
