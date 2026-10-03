/**
 * Tool-call markup written as answer text never reaches a traveller. A model forced to answer
 * without tools (the last round) sometimes writes the call it wanted as text: DeepSeek's
 * `<｜｜DSML｜｜ calls>` (recorded live) or `<｜tool▁calls▁begin｜>` tokens, or Anthropic-style
 * `<function_calls>`. The turn strips it when real words remain, retries once without tools when
 * nothing does, and otherwise ends on the route's usual `AI_UNAVAILABLE` frame; each case is a
 * typed event the caller logs.
 */
import { describe, expect, it } from 'vitest';

import {
  buildSystemBlocks,
  createGateway,
  createToolRegistry,
  REPO_PACKS,
  runTurn,
  type MeterHandle,
  type ToolMarkupEvent,
  type TurnEvent,
} from '../src';
import { toolMarkupFilter } from '../src/runner/tool-markup';
import { fixtureTransport } from './fixture-transport';

function meter() {
  const settled: string[] = [];
  const handle: MeterHandle = {
    reservation: { metered: true, fairUse: 'ok', usage: null },
    commit: () => {
      settled.push('commit');
      return Promise.resolve({ usage: null });
    },
    release: () => {
      settled.push('release');
      return Promise.resolve({ usage: null });
    },
  };
  return { handle, settled };
}

/** A streamed answer of `chunks`, as the Messages API sends it. */
function sse(chunks: readonly string[]): string {
  const events: { event: string; data: unknown }[] = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_synthetic',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-flash',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    ...chunks.map((text) => ({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    })),
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ];
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

function syntheticFetch(answers: readonly (readonly string[])[]) {
  const queue = [...answers];
  const requests: Record<string, unknown>[] = [];
  const fetch = (_url: unknown, init?: RequestInit) => {
    requests.push(
      JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>,
    );
    const chunks = queue.shift();
    if (chunks === undefined) throw new Error('no synthetic answer left');
    return Promise.resolve(
      new Response(sse(chunks), { headers: { 'content-type': 'text/event-stream' } }),
    );
  };
  return { fetch, requests };
}

async function turn(fetch: typeof globalThis.fetch, handle: MeterHandle) {
  const markups: ToolMarkupEvent[] = [];
  const events: TurnEvent[] = [];
  for await (const event of runTurn(
    {
      route: 'guide.chat',
      system: buildSystemBlocks({ pack: REPO_PACKS.chava }),
      messages: [{ role: 'user', content: 'add it to day 1' }],
      tool: { uid: '0190f0a0-0000-7000-8000-00000000d001', tripId: null, caller: 'C' },
      // The only round is the forced last one: tools are offered with tool_choice none.
      maxToolRounds: 0,
    },
    {
      gateway: createGateway({ apiKey: 'fixture-key', fetch, maxAttempts: 1 }),
      registry: createToolRegistry(),
      meter: handle,
      hooks: { onToolMarkup: (event) => markups.push(event) },
    },
  ))
    events.push(event);
  const text = events.flatMap((e) => (e.type === 'token' ? [e.text] : [])).join('');
  return { events, text, markups };
}

const MARKUP = /｜|DSML|tool▁|<\/?function_calls>|<invoke\b/u;

describe('tool-call markup in a forced answer', () => {
  it('retries the recorded DSML answer once without tools, and streams only the retry', async () => {
    const transport = fixtureTransport([
      'flash-stream-dsml-tool-markup',
      'flash-stream-after-tool-markup-retry',
    ]);
    const { handle, settled } = meter();
    const { events, text, markups } = await turn(transport.fetch, handle);

    expect(text).toBe(
      "Day 1 is still empty, so I've got a clean slate for it. I'll propose adding Cộng Cà Phê Sân Bay to day 1 for you to confirm.",
    );
    expect(text).not.toMatch(MARKUP);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(settled).toEqual(['commit']);
    expect(markups).toEqual([{ route: 'guide.chat', round: 0, forced: true, outcome: 'retried' }]);
    const retry = transport.requests[1] ?? {};
    expect(retry.tools).toBeUndefined();
    expect(JSON.stringify(retry.messages)).toContain('plain words only');
  });

  it('strips markup split across tokens and keeps the words around it, without a retry', async () => {
    const synthetic = syntheticFetch([
      [
        'Day 1 is empty, so ',
        "I'd add Cộng Cà Phê Sân Bay there.\n\n<｜",
        '｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="propose_plan_changes">',
        '</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>',
        '\nWant a time on it?',
      ],
    ]);
    const { handle, settled } = meter();
    const { text, markups } = await turn(synthetic.fetch, handle);

    expect(text).toBe(
      "Day 1 is empty, so I'd add Cộng Cà Phê Sân Bay there.\n\nWant a time on it?",
    );
    expect(synthetic.requests).toHaveLength(1);
    expect(settled).toEqual(['commit']);
    expect(markups).toEqual([{ route: 'guide.chat', round: 0, forced: true, outcome: 'stripped' }]);
  });

  it('ends on the usual unavailable frame when the retry is markup too', async () => {
    const call =
      '<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>propose_plan_changes\n```json\n{"ops": []}\n```<｜tool▁call▁end｜><｜tool▁calls▁end｜>';
    const synthetic = syntheticFetch([[call], ['  ', call]]);
    const { handle, settled } = meter();
    const { events, text, markups } = await turn(synthetic.fetch, handle);

    expect(text.trim()).toBe('');
    expect(events.at(-1)).toEqual({ type: 'error', code: 'AI_UNAVAILABLE', retryable: true });
    expect(settled).toEqual(['release']);
    expect(markups).toEqual([{ route: 'guide.chat', round: 0, forced: true, outcome: 'fallback' }]);
  });
});

describe('toolMarkupFilter', () => {
  const run = (tokens: readonly string[]) => {
    const filter = toolMarkupFilter();
    const out = tokens.map((token) => filter.push(token)).join('');
    const end = filter.end();
    return { text: out + end.text, found: end.found };
  };

  it('passes ordinary text with angle brackets and bars through untouched', () => {
    expect(run(['Under 5 km, so < 10 minutes', ' | easy walk', ' <3'])).toEqual({
      text: 'Under 5 km, so < 10 minutes | easy walk <3',
      found: false,
    });
  });

  it('removes Anthropic-style function call blocks, keeping the text after them', () => {
    expect(
      run([
        'Checking the plan.',
        '<function_calls><invoke name="plan_read"></invoke></function_calls>',
        ' Day 2 is free.',
      ]),
    ).toEqual({ text: 'Checking the plan. Day 2 is free.', found: true });
  });

  it('drops an unclosed block to the end of the answer', () => {
    expect(run(['Sure. ', '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="x">'])).toEqual({
      text: 'Sure.',
      found: true,
    });
  });
});
