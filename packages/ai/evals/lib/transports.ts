/**
 * The eval provider's network boundaries: recorded DeepSeek and Tavily responses served in call
 * order (replay), or live calls that can store each response as the next recording (live with
 * EVAL_RECORD=1). A `seeded` case's inline answer is served in both modes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadFixture, type FixtureDir } from '../../test/fixture-transport';
import type { RunCaseOptions } from './provider';
import type { CaseVars } from './suite';

function inlineBody(vars: CaseVars, model: string): unknown {
  const replay = vars.replay ?? {};
  const content: unknown[] = [];
  if (replay.text !== undefined) content.push({ type: 'text', text: replay.text });
  (replay.tool_calls ?? []).forEach((call, index) => {
    content.push({
      type: 'tool_use',
      id: `toolu_eval_${index}`,
      name: call.name,
      input: call.input,
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
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

export function modelFixtures(vars: CaseVars): string[] {
  const replay = vars.replay ?? {};
  if (replay.fixtures !== undefined) return [...replay.fixtures];
  const single = replay.fixture ?? vars.fixture;
  return single === undefined ? [] : [single];
}

export function jsonResponse(body: unknown, status = 200): Response {
  const headers = new Headers({ 'content-type': 'application/json', 'request-id': 'req_eval' });
  return new Response(JSON.stringify(body), { status, headers });
}

/** Serves recorded responses from `dir` in order, in place of `fetch`. */
function replayQueue(names: readonly string[], dir: FixtureDir, what: string): typeof fetch {
  const queue = [...names];
  return () => {
    const name = queue.shift();
    if (name === undefined) throw new Error(`eval replay: no recorded ${what} response left`);
    const { response } = loadFixture(name, dir);
    return Promise.resolve(jsonResponse(response.body, response.status));
  };
}

/** Live calls that also store each response under the next name (EVAL_RECORD=1). */
function recordingFetch(names: readonly string[], dir: FixtureDir, source: string): typeof fetch {
  const queue = [...names];
  return async (url, init) => {
    const response = await fetch(url, init);
    const name = queue.shift();
    if (name === undefined) return response;
    const body = (await response.clone().json()) as unknown;
    const path = fileURLToPath(new URL(`../../test/fixtures/${dir}/${name}.json`, import.meta.url));
    mkdirSync(fileURLToPath(new URL(`../../test/fixtures/${dir}/`, import.meta.url)), {
      recursive: true,
    });
    const recorded = { source, response: { status: response.status, body } };
    writeFileSync(path, `${JSON.stringify(recorded, null, 2)}\n`);
    return response;
  };
}

const RECORDED_AT = new Date().toISOString().slice(0, 10);

export interface Transports {
  readonly model: typeof fetch;
  readonly search: typeof fetch | undefined;
}

export function transportsFor(vars: CaseVars, options: RunCaseOptions, model: string): Transports {
  const searches = vars.search_fixtures ?? [];
  if (options.mode === 'live' && vars.seeded !== true) {
    const record = options.record === true;
    return {
      model: record
        ? recordingFetch(
            modelFixtures(vars),
            'deepseek',
            `Live recording from DeepSeek (${model}) through its Anthropic-format API, ${RECORDED_AT}.`,
          )
        : fetch,
      search:
        options.searchKey === undefined
          ? undefined
          : record
            ? recordingFetch(
                searches,
                'tavily',
                `Live recording from Tavily's search API, ${RECORDED_AT}.`,
              )
            : fetch,
    };
  }
  const fixtures = modelFixtures(vars);
  return {
    model:
      fixtures.length === 0 || vars.seeded === true
        ? () => Promise.resolve(jsonResponse(inlineBody(vars, model)))
        : replayQueue(fixtures, 'deepseek', 'model'),
    search: searches.length === 0 ? undefined : replayQueue(searches, 'tavily', 'search'),
  };
}
