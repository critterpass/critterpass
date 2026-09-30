/**
 * The guide suite: each case runs through the guide's own prompt builders (the sheet, a crew-chat
 * mention, a queued answer, a proactive offer) and the real gateway, tool registry and web search
 * screen; only the network boundaries replay (or, live, call DeepSeek and Tavily). Cases name their
 * surface in `vars.surface`; a mention's crew chat window is `vars.untrusted` (crew messages), so
 * the injection graders read it as they do everywhere else.
 */
import type Anthropic from '@anthropic-ai/sdk';

import { createGateway, type Gateway, type GatewayInput } from '../../src/client';
import { wrapAllUntrusted } from '../../src/context/wrap-untrusted';
import { GatewayError } from '../../src/errors';
import { REPO_PACKS } from '../../src/persona/loader';
import type { PersonaPack } from '../../src/persona/schema';
import { resolveRoute } from '../../src/routing';
import {
  buildCrewMentionRequest,
  buildGuideChatRequest,
  writeGuideOffer,
  type OfferFacts,
} from '../../src/routes/guide';
import { createTavilySearch } from '../../src/search';
import { textOf } from '../../src/structured';
import {
  collectCitedGrounding,
  collectGrounding,
  mergeGrounding,
  unverifiedTextNumbers,
} from '../../src/tools/grounding';
import { createToolRegistry, routeTools, type ToolRegistry } from '../../src/tools/registry';
import { renderToolJson } from '../../src/tools/render';
import { createWebSearchExecutor, webSources, withSources } from '../../src/tools/web-search';
import { EVAL_NOW, type EvalOutput, type RunCaseOptions } from '../lib/provider';
import { check, type CaseReport, type RunOptions, type SuiteReport } from '../lib/runner';
import { loadSuite, type CaseVars } from '../lib/suite';
import { modelFixtures, transportsFor } from '../lib/transports';

export const GUIDE_SUITE = 'guide';
const MAX_ROUNDS = 4;

type Surface = 'chat' | 'queued' | 'mention' | 'offer';

interface GuideVars extends CaseVars {
  readonly surface?: Surface;
  readonly history?: { role: 'user' | 'guide'; content: string }[];
  readonly offer?: OfferFacts;
}

function request(vars: GuideVars, pack: PersonaPack): GatewayInput {
  const directives = { chattiness: vars.chattiness, locale: vars.locale };
  const surface = vars.surface ?? 'chat';
  const built =
    surface === 'mention'
      ? buildCrewMentionRequest({
          pack,
          tripContext: vars.trip_context,
          directives,
          window: [...(vars.untrusted ?? []), { text: vars.question, label: 'Dev' }].map(
            (line, index) => ({
              seq: index + 1,
              author_kind: 'member' as const,
              author_name: line.label ?? null,
              body: line.text,
              created_at: EVAL_NOW.toISOString(),
            }),
          ),
        })
      : buildGuideChatRequest({
          pack,
          tripContext: vars.trip_context,
          history: vars.history ?? [],
          question: vars.question,
          documents: wrapAllUntrusted(
            (vars.untrusted ?? []).map(({ label, ...item }) =>
              label === undefined ? item : { ...item, label },
            ),
          ),
          directives,
          queued: surface === 'queued',
        });
  const tools = routeTools(resolveRoute(vars.route));
  return { ...built, ...(tools.length === 0 ? {} : { tools }) };
}

interface Turn {
  readonly content: Anthropic.Messages.ContentBlock[];
  readonly toolCalls: { name: string; input: unknown }[];
  readonly outputs: { name: string; output: unknown }[];
  readonly error: string | null;
}

/** The turn as the guide runs it: tools answered from the case or the registry, then the answer. */
async function converse(
  vars: GuideVars,
  input: GatewayInput,
  deps: { gateway: Gateway; registry: ToolRegistry; rounds: number; live: boolean },
): Promise<Turn> {
  let messages = [...input.messages];
  const toolCalls: Turn['toolCalls'] = [];
  const outputs: Turn['outputs'] = [];
  const caller = resolveRoute(vars.route).caller ?? 'C';
  for (let round = 1; ; round += 1) {
    let message: Anthropic.Messages.Message;
    try {
      const answerNow = deps.live && round >= deps.rounds && (input.tools?.length ?? 0) > 0;
      const req = {
        ...input,
        messages,
        ...(answerNow ? { toolChoice: { type: 'none' } as const } : {}),
      };
      message = (await deps.gateway.callModel(vars.route, req)).message;
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
      const served = vars.tool_results?.find((entry) => entry.tool === call.name);
      if (served !== undefined) {
        outputs.push({ name: call.name, output: served.output });
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: renderToolJson(served.output),
        });
        continue;
      }
      const result = await deps.registry.execute(
        { id: call.id, name: call.name, input: call.input },
        { uid: 'eval', tripId: null, caller, route: vars.route },
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

export async function runGuideCase(vars: GuideVars, options: RunCaseOptions): Promise<EvalOutput> {
  const route = resolveRoute(vars.route);
  const pack = REPO_PACKS[vars.persona ?? 'tokek'];
  const live = options.mode === 'live' && vars.seeded !== true;
  const transports = transportsFor(vars, options, route.model);
  let captured: Record<string, unknown> | undefined;
  const gateway = createGateway({
    apiKey: live ? (options.apiKey ?? '') : 'replay-key',
    ...(live && options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    fetch: (url, init) => {
      captured ??= JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >;
      return transports.model(url, init);
    },
    maxAttempts: live ? 3 : 1,
  });
  const base = { structured: undefined, decision: null, pack };
  if (vars.surface === 'offer' && vars.offer !== undefined) {
    const offer = await writeGuideOffer(gateway, pack, vars.offer);
    return {
      ...base,
      text: offer.text,
      answer: offer.text,
      toolCalls: [],
      request: captured ?? {},
      error: null,
      violations: [],
    };
  }
  const registry = createToolRegistry();
  if (route.webSearch && transports.search !== undefined) {
    const search = createTavilySearch({
      apiKey: options.searchKey ?? 'replay-key',
      fetch: transports.search,
    });
    registry.registerToolExecutor('web_search', createWebSearchExecutor(search));
  }
  const rounds = live ? MAX_ROUNDS : Math.max(1, modelFixtures(vars).length);
  const turn = await converse(vars, request(vars, pack), { gateway, registry, rounds, live });
  const answer = textOf({ content: turn.content });
  const text = route.webSearch ? withSources(answer, webSources(turn.outputs)) : answer;
  const grounding = mergeGrounding(
    collectGrounding((vars.tool_results ?? []).map((result) => result.output)),
    collectCitedGrounding(turn.outputs),
    collectGrounding(vars.trip_context === undefined ? [] : [vars.trip_context]),
  );
  return {
    ...base,
    text,
    answer,
    toolCalls: turn.toolCalls,
    request: captured ?? {},
    error: turn.error,
    violations: vars.tool_results === undefined ? [] : unverifiedTextNumbers(answer, grounding),
  };
}

export async function runGuideSuite(options: RunOptions, threshold: number): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const testCase of loadSuite(GUIDE_SUITE, options.root).cases) {
    const output = await runGuideCase(testCase.vars, {
      mode: options.mode,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      ...(options.searchKey === undefined ? {} : { searchKey: options.searchKey }),
      ...(options.record === undefined ? {} : { record: options.record }),
    });
    const assertions = [];
    for (const assertion of testCase.assert)
      assertions.push(await check(assertion, output, testCase, options));
    const graded = assertions.filter((a) => a.outcome !== 'skipped');
    const outcome =
      graded.length === 0 ? 'skipped' : graded.every((a) => a.outcome === 'pass') ? 'pass' : 'fail';
    cases.push({
      description: testCase.description,
      outcome,
      assertions,
      output: output.error ?? output.text,
    });
  }
  const graded = cases.filter((c) => c.outcome !== 'skipped').length;
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = graded === 0 ? 0 : passed / graded;
  return {
    suite: GUIDE_SUITE,
    mode: options.mode,
    graded,
    passed,
    score,
    threshold,
    ok: graded > 0 && score >= threshold,
    cases,
  };
}
