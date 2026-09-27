/**
 * The eval provider: one case through the real request pipeline (persona layering, turn
 * directives, untrusted-data wrapping, per-route tools) and the real gateway, then through the
 * code-side checks under test (grounding validators, the autonomy decider).
 *
 * `replay` (the default, and what CI runs): the gateway's network boundary serves the case's
 * recorded response (a fixture file or an inline answer), so the suite grades our pipeline
 * against fixed model behaviour. `live`: the same request goes to Anthropic's API, or to the
 * Anthropic-compatible endpoint named by `baseURL`. ANTHROPIC_BASE_URL is ignored, so a stand-in
 * endpoint is only ever graded when a run names it explicitly.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { decideAutonomy, type AutonomyDecision } from '@cp/domain';

import { createGateway, type GatewayInput } from '../../src/client';
import { userTurnWithData, wrapAllUntrusted } from '../../src/context/wrap-untrusted';
import { GatewayError } from '../../src/errors';
import { applyTurnDirectives } from '../../src/persona/chattiness';
import { buildSystemBlocks } from '../../src/persona/layering';
import { REPO_PACKS } from '../../src/persona/loader';
import type { PersonaPack } from '../../src/persona/schema';
import { resolveRoute } from '../../src/routing';
import {
  collectGrounding,
  unverifiedTextNumbers,
  validateStructured,
  type GroundingViolation,
} from '../../src/tools/grounding';
import { routeTools, visibleAnswer } from '../../src/tools/web-search';
import { loadFixture } from '../../test/fixture-transport';
import type { CaseVars } from './suite';

export type EvalMode = 'replay' | 'live';

/** The code-side checks a run grades; a test swaps one out to prove the gate catches it. */
export interface Pipeline {
  readonly validateStructured: typeof validateStructured;
  readonly unverifiedTextNumbers: typeof unverifiedTextNumbers;
  readonly decideAutonomy: typeof decideAutonomy;
}

export const PIPELINE: Pipeline = { validateStructured, unverifiedTextNumbers, decideAutonomy };

export interface EvalOutput {
  /** What a client would be shown (web search answers carry their allowed sources). */
  readonly text: string;
  readonly toolCalls: readonly { readonly name: string; readonly input: unknown }[];
  /** The parsed JSON answer on structured routes. */
  readonly structured: unknown;
  /** The Messages API request the pipeline built. */
  readonly request: Record<string, unknown>;
  /** Gateway error code, when the call failed (`AI_REFUSED`, ...). */
  readonly error: string | null;
  readonly violations: readonly GroundingViolation[];
  readonly decision: AutonomyDecision | null;
  readonly pack: PersonaPack | null;
}

/** The clock autonomy cases are decided at, so a vote's `closes_at` is stable. */
export const EVAL_NOW = new Date('2026-10-12T08:00:00Z');

function inlineBody(vars: CaseVars, model: string): unknown {
  const replay = vars.replay ?? {};
  const content: unknown[] = [];
  if (replay.text !== undefined) content.push({ type: 'text', text: replay.text, citations: null });
  (replay.tool_calls ?? []).forEach((call, index) => {
    content.push({
      type: 'tool_use',
      id: `toolu_eval_${index}`,
      name: call.name,
      input: call.input,
      caller: { type: 'direct' },
    });
  });
  const stop = replay.stop_reason ?? (replay.tool_calls?.length ? 'tool_use' : 'end_turn');
  return {
    id: 'msg_eval_replay',
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    stop_details:
      stop === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
    container: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

/** One recorded response at the network boundary, in place of `fetch`. */
function replayFetch(vars: CaseVars, model: string): typeof fetch {
  const fixture = vars.replay?.fixture ?? vars.fixture;
  return () => {
    const headers = new Headers({ 'content-type': 'application/json', 'request-id': 'req_eval' });
    if (fixture === undefined) {
      return Promise.resolve(new Response(JSON.stringify(inlineBody(vars, model)), { headers }));
    }
    const { response } = loadFixture(fixture);
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status, headers }),
    );
  };
}

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
  const blocks = wrapAllUntrusted(untrusted, { citations: route.output !== 'structured' });
  let messages: Anthropic.Messages.MessageParam[] = [userTurnWithData(vars.question, blocks)];
  if (pack !== null)
    messages = applyTurnDirectives(messages, pack, {
      chattiness: vars.chattiness,
      locale: vars.locale,
    });
  messages.push(...toolExchange(vars));
  const tools = route.caller === null ? [] : routeTools(route);
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
    },
  };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export interface RunCaseOptions {
  readonly mode: EvalMode;
  readonly pipeline?: Pipeline;
  readonly apiKey?: string;
  /** Live runs only: an Anthropic-compatible endpoint to grade instead of Anthropic's API. */
  readonly baseURL?: string;
}

export async function runCase(vars: CaseVars, options: RunCaseOptions): Promise<EvalOutput> {
  const pipeline = options.pipeline ?? PIPELINE;
  const route = resolveRoute(vars.route);
  const { input, pack } = buildRequest(vars);
  let request: Record<string, unknown> = {};
  const replay = replayFetch(vars, route.model);
  const recordingFetch: typeof fetch = (url, init) => {
    request = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    >;
    return options.mode === 'live' ? fetch(url, init) : replay(url, init);
  };
  const gateway = createGateway({
    apiKey: options.mode === 'live' ? (options.apiKey ?? '') : 'replay-key',
    ...(options.mode === 'live' && options.baseURL !== undefined
      ? { baseURL: options.baseURL }
      : {}),
    fetch: recordingFetch,
    maxAttempts: options.mode === 'live' ? 3 : 1,
  });
  let content: Anthropic.Messages.ContentBlock[] = [];
  let error: string | null = null;
  try {
    content = (await gateway.callModel(vars.route, input)).message.content;
  } catch (caught) {
    if (!(caught instanceof GatewayError)) throw caught;
    error = caught.code;
  }
  const text = route.webSearch
    ? visibleAnswer(content)
    : content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const structured =
    route.output === 'structured' || vars.tool_results !== undefined ? parseJson(text) : undefined;
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
  const toolCalls = content.flatMap((block) =>
    block.type === 'tool_use' ? [{ name: block.name, input: block.input }] : [],
  );
  return { text, toolCalls, structured, request, error, violations, decision, pack };
}
