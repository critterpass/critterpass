/**
 * The eval provider: one case through the real request pipeline (persona layering, turn
 * directives, untrusted-data wrapping, per-route tools, the requested JSON format) and the real
 * gateway, then through the code-side checks under test (grounding validators, the autonomy
 * decider). On a web search route the case runs the real tool loop: `web_search` calls go through
 * the registry and the supplier-screening executor, and the answer carries its sources.
 *
 * `replay` (the default, and what CI runs): the gateway's network boundary serves the case's
 * recorded responses (fixture files, in call order, or an inline answer) and the search provider's
 * boundary serves recorded search responses, so the suite grades our pipeline against fixed model
 * behaviour. `live`: the same requests go to DeepSeek (or the endpoint named by `baseURL`) and to
 * the configured search provider. A `seeded` case's answer is a deliberate model slip that the
 * validators must catch, so it is served from the case in both modes.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { decideAutonomy, type AiCaller, type AutonomyDecision } from '@cp/domain';

import { createGateway, type Gateway, type GatewayInput } from '../../src/client';
import { userTurnWithData, wrapAllUntrusted } from '../../src/context/wrap-untrusted';
import { GatewayError } from '../../src/errors';
import { applyTurnDirectives } from '../../src/persona/chattiness';
import { buildSystemBlocks } from '../../src/persona/layering';
import { REPO_PACKS } from '../../src/persona/loader';
import type { PersonaPack } from '../../src/persona/schema';
import { resolveRoute } from '../../src/routing';
import { parseStructuredText, textOf } from '../../src/structured';
import {
  collectGrounding,
  unverifiedTextNumbers,
  validateStructured,
  type GroundingViolation,
} from '../../src/tools/grounding';
import { createToolRegistry, routeTools, type ToolRegistry } from '../../src/tools/registry';
import { createTavilySearch } from '../../src/search';
import { createWebSearchExecutor, webSources, withSources } from '../../src/tools/web-search';
import type { CaseVars } from './suite';
import { modelFixtures, transportsFor } from './transports';

export type EvalMode = 'replay' | 'live';

/** The code-side checks a run grades; a test swaps one out to prove the gate catches it. */
export interface Pipeline {
  readonly validateStructured: typeof validateStructured;
  readonly unverifiedTextNumbers: typeof unverifiedTextNumbers;
  readonly decideAutonomy: typeof decideAutonomy;
}

export const PIPELINE: Pipeline = { validateStructured, unverifiedTextNumbers, decideAutonomy };

export interface EvalOutput {
  /** What a client would be shown (web search answers carry their sources). */
  readonly text: string;
  /** The model's answer alone (sentence and voice checks read this). */
  readonly answer: string;
  readonly toolCalls: readonly { readonly name: string; readonly input: unknown }[];
  /** The parsed JSON answer on structured routes. */
  readonly structured: unknown;
  /** The first Messages API request the pipeline built. */
  readonly request: Record<string, unknown>;
  /** Gateway error code, when the call failed (`AI_REFUSED`, ...). */
  readonly error: string | null;
  readonly violations: readonly GroundingViolation[];
  readonly decision: AutonomyDecision | null;
  readonly pack: PersonaPack | null;
}

/** The clock autonomy cases are decided at, so a vote's `closes_at` is stable. */
export const EVAL_NOW = new Date('2026-10-12T08:00:00Z');
/** Model calls a live case may make (tool rounds, then the answer). */
const MAX_ROUNDS = 4;

function toolExchange(vars: CaseVars): Anthropic.Messages.MessageParam[] {
  const results = vars.tool_results ?? [];
  if (results.length === 0) return [];
  const id = (index: number) => `toolu_eval_result_${index}`;
  return [
    {
      role: 'assistant',
      content: results.map((result, index) => ({
        type: 'tool_use' as const,
        id: id(index),
        name: result.tool,
        input: {},
      })),
    },
    {
      role: 'user',
      content: results.map((result, index) => ({
        type: 'tool_result' as const,
        tool_use_id: id(index),
        content: JSON.stringify(result.output),
      })),
    },
  ];
}

export function buildRequest(vars: CaseVars): { input: GatewayInput; pack: PersonaPack | null } {
  const route = resolveRoute(vars.route);
  const pack = vars.persona === undefined ? null : REPO_PACKS[vars.persona];
  const untrusted = (vars.untrusted ?? []).map(({ label, ...item }) =>
    label === undefined ? item : { ...item, label },
  );
  let messages: Anthropic.Messages.MessageParam[] = [
    userTurnWithData(vars.question, wrapAllUntrusted(untrusted)),
  ];
  if (pack !== null)
    messages = applyTurnDirectives(messages, pack, {
      chattiness: vars.chattiness,
      locale: vars.locale,
    });
  messages.push(...toolExchange(vars));
  const tools = routeTools(route);
  const system =
    pack === null
      ? undefined
      : buildSystemBlocks({
          pack,
          ...(vars.trip_context === undefined ? {} : { tripContext: vars.trip_context }),
        });
  return {
    pack,
    input: {
      messages,
      ...(system === undefined ? {} : { system }),
      ...(tools.length === 0 ? {} : { tools }),
      ...(vars.format === undefined
        ? {}
        : { outputFormat: { type: 'json_schema' as const, schema: vars.format } }),
    },
  };
}

export interface RunCaseOptions {
  readonly mode: EvalMode;
  readonly pipeline?: Pipeline;
  readonly apiKey?: string;
  /** Live runs only: an Anthropic-format endpoint to grade instead of DeepSeek's. */
  readonly baseURL?: string;
  /** Live runs only: the search key for web search cases. */
  readonly searchKey?: string;
  /** Live runs only: store the model and search responses under the case's fixture names. */
  readonly record?: boolean;
}

interface Conversation {
  readonly content: Anthropic.Messages.ContentBlock[];
  readonly toolCalls: { name: string; input: unknown }[];
  readonly outputs: { name: string; output: unknown }[];
  readonly error: string | null;
}

/**
 * The case as a turn: tool calls run through the registry (web search through its executor, every
 * other tool answers TOOL_UNAVAILABLE since evals have no database) until the model answers.
 */
async function converse(
  vars: CaseVars,
  input: GatewayInput,
  deps: {
    readonly gateway: Gateway;
    readonly registry: ToolRegistry;
    readonly rounds: number;
    readonly caller: AiCaller;
  },
): Promise<Conversation> {
  let messages = [...input.messages];
  const toolCalls: Conversation['toolCalls'] = [];
  const outputs: Conversation['outputs'] = [];
  for (let round = 1; ; round += 1) {
    let message: Anthropic.Messages.Message;
    try {
      message = (await deps.gateway.callModel(vars.route, { ...input, messages })).message;
    } catch (caught) {
      if (!(caught instanceof GatewayError)) throw caught;
      return { content: [], toolCalls, outputs, error: caught.code };
    }
    const calls = message.content.flatMap((block) => (block.type === 'tool_use' ? [block] : []));
    toolCalls.push(...calls.map((call) => ({ name: call.name, input: call.input })));
    if (message.stop_reason !== 'tool_use' || round >= deps.rounds) {
      return { content: message.content, toolCalls, outputs, error: null };
    }
    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const result = await deps.registry.execute(
        { id: call.id, name: call.name, input: call.input },
        { uid: 'eval', tripId: null, caller: deps.caller, route: vars.route },
      );
      if (result.ok) outputs.push({ name: result.name, output: result.output });
      results.push(result.block);
    }
    messages = [
      ...messages,
      { role: 'assistant', content: message.content },
      { role: 'user', content: results },
    ];
  }
}

export async function runCase(vars: CaseVars, options: RunCaseOptions): Promise<EvalOutput> {
  const pipeline = options.pipeline ?? PIPELINE;
  const route = resolveRoute(vars.route);
  const { input, pack } = buildRequest(vars);
  const live = options.mode === 'live' && vars.seeded !== true;
  const transports = transportsFor(vars, options, route.model);
  let request: Record<string, unknown> | undefined;
  const capture: typeof fetch = (url, init) => {
    request ??= JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    return transports.model(url, init);
  };
  const gateway = createGateway({
    apiKey: live ? (options.apiKey ?? '') : 'replay-key',
    ...(live && options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    fetch: capture,
    maxAttempts: live ? 3 : 1,
  });
  const registry = createToolRegistry();
  if (route.webSearch && transports.search !== undefined) {
    const search = createTavilySearch({
      apiKey: options.searchKey ?? 'replay-key',
      fetch: transports.search,
    });
    registry.registerToolExecutor('web_search', createWebSearchExecutor(search));
  }

  // Replay has exactly the recorded responses; live runs the turn to its answer.
  const rounds = live ? MAX_ROUNDS : Math.max(1, modelFixtures(vars).length);
  const turn = await converse(vars, input, {
    gateway,
    registry,
    rounds,
    caller: route.caller ?? 'C',
  });
  const { content, toolCalls, outputs, error } = turn;
  const answer = textOf({ content });
  const text = route.webSearch ? withSources(answer, webSources(outputs)) : answer;
  const structured =
    route.output === 'structured' || vars.format !== undefined || vars.tool_results !== undefined
      ? parseStructuredText(answer)
      : undefined;
  const grounding = collectGrounding((vars.tool_results ?? []).map((result) => result.output));
  const violations =
    vars.tool_results === undefined
      ? []
      : structured === undefined
        ? pipeline.unverifiedTextNumbers(text, grounding)
        : pipeline.validateStructured(structured, grounding);
  const action = vars.action;
  const decision =
    action === undefined
      ? null
      : pipeline.decideAutonomy(
          {
            kind: action.kind,
            reversible: action.reversible,
            costDeltaMinor: action.cost_delta_minor,
            bookingImpact: action.booking_impact,
            affectedUserIds: action.affected,
            requesterId: action.requester,
            timeCritical: action.time_critical,
          },
          { now: EVAL_NOW, inTrip: action.in_trip },
        );
  return {
    text,
    answer,
    toolCalls,
    structured,
    request: request ?? {},
    error,
    violations,
    decision,
    pack,
  };
}
