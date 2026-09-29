/**
 * Prompt suites whose entry point streams (the guide pitch) or searches (the guest brief), with
 * cases beside the prompt (`src/prompts/<suite>/evals.yaml`). Only the network boundaries replay:
 * DeepSeek's streamed events (recorded as `sse`) and Tavily's search responses; the request is
 * built and validated by the real code. A template fallback never passes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pitchUngroundedTokens, type PitchFacts } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { streamPitch, type PitchModelSection } from '../../src/prompts/pitch/prompt';
import { loadFixture } from '../../test/fixture-transport';
import type { EvalMode } from './provider';
import type { CaseReport } from './runner';

export interface StreamRunOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

const PROMPTS_DIR = resolve(fileURLToPath(new URL('../../src/prompts/', import.meta.url)));
const FIXTURES = fileURLToPath(new URL('../../test/fixtures/deepseek/', import.meta.url));
const RECORDED_AT = new Date().toISOString().slice(0, 10);
const UUID = (n: number) => `0199a0f2-7c1e-7d4b-9a53-${String(n).padStart(12, '0')}`;

export function loadStreamCases(suite: string): unknown[] {
  const cases = parse(readFileSync(resolve(PROMPTS_DIR, suite, 'evals.yaml'), 'utf8')) as unknown;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`${suite}: no cases`);
  return cases;
}

function parseSse(text: string): { event: string; data: unknown }[] {
  return text
    .split('\n\n')
    .map((block) => {
      const event = /^event: (.*)$/mu.exec(block)?.[1];
      const data = /^data: (.*)$/mu.exec(block)?.[1];
      return event === undefined || data === undefined
        ? null
        : { event, data: JSON.parse(data) as unknown };
    })
    .filter((frame): frame is { event: string; data: unknown } => frame !== null);
}

/** Replays `fixture` (streamed or JSON), or goes live and optionally records what came back. */
export function modelTransport(fixture: string, options: StreamRunOptions): typeof fetch {
  let calls = 0;
  if (options.mode === 'replay') {
    return () => {
      const name = calls === 0 ? fixture : `${fixture}-${calls + 1}`;
      calls += 1;
      const { response } = loadFixture(name, 'deepseek');
      if (response.sse !== undefined) {
        const text = response.sse
          .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
          .join('');
        return Promise.resolve(
          new Response(text, {
            status: response.status,
            headers: { 'content-type': 'text/event-stream' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }
  return async (url, init) => {
    const live = await fetch(url, init);
    if (options.record !== true) return live;
    const name = calls === 0 ? fixture : `${fixture}-${calls + 1}`;
    calls += 1;
    const text = await live.text();
    const streamed = (live.headers.get('content-type') ?? '').includes('event-stream');
    const source = `Live recording from DeepSeek through its Anthropic-format API, ${RECORDED_AT}.`;
    mkdirSync(FIXTURES, { recursive: true });
    const response = streamed
      ? { status: live.status, sse: parseSse(text) }
      : { status: live.status, body: JSON.parse(text) as unknown };
    writeFileSync(
      resolve(FIXTURES, `${name}.json`),
      `${JSON.stringify({ source, response }, null, 2)}\n`,
    );
    return new Response(text, { status: live.status, headers: live.headers });
  };
}

export function evalGateway(fixture: string, options: StreamRunOptions) {
  return createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: modelTransport(fixture, options),
    maxAttempts: 1,
  });
}

export function report(
  description: string,
  failures: readonly string[],
  output: string,
): CaseReport {
  return {
    description,
    outcome: failures.length === 0 ? 'pass' : 'fail',
    assertions:
      failures.length === 0
        ? [{ type: 'prompt', outcome: 'pass', reason: 'all checks' }]
        : failures.map((reason) => ({ type: 'prompt', outcome: 'fail' as const, reason })),
    output,
  };
}

const pitchCase = z.object({
  fixture: z.string().min(1),
  must: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  facts: z.object({
    place: z.object({
      name: z.string(),
      country: z.string(),
      coverage: z.enum(['live', 'guest']),
      guide: z.string(),
    }),
    crew: z.object({ name: z.string(), size: z.int().positive() }),
    month: z.int().min(1).max(12),
    fares: z.array(
      z.object({
        origin: z.string(),
        members: z.int(),
        price_minor: z.int(),
        currency: z.string(),
        duration_min: z.int().nullable(),
        transfers: z.int().nullable(),
      }),
    ),
    season: z.object({
      best_months: z.array(z.int()),
      events: z.array(z.object({ name: z.string(), kind: z.string(), starts_on: z.string() })),
    }),
    taste: z.array(z.object({ tag: z.string(), members: z.int().positive() })),
    alternatives: z.array(
      z.object({
        name: z.string(),
        kind: z.enum(['cheaper', 'nearby']),
        delta_minor: z.int().optional(),
        currency: z.string().optional(),
      }),
    ),
  }),
});

/** Words a pitch must never use: budgets are private, and supplier names never reach the guide. */
const ALWAYS_FORBIDDEN = [
  'budget',
  'afford',
  'agoda',
  'booking.com',
  'klook',
  'viator',
  'expedia',
  'http',
];

export function pitchFactsFromCase(raw: z.infer<typeof pitchCase>['facts']): PitchFacts {
  let n = 0;
  const ids = (count: number) => Array.from({ length: count }, () => UUID((n += 1)));
  return {
    place: { id: UUID(900), ...raw.place },
    crew: raw.crew,
    month: raw.month,
    fares: raw.fares.map((fare) => ({ ...fare, seen_at: null })),
    season: raw.season,
    taste: raw.taste.map((taste) => ({ tag: taste.tag, member_ids: ids(taste.members) })),
    alternatives: raw.alternatives.map((alt, i) => ({
      place_id: UUID(800 + i),
      name: alt.name,
      kind: alt.kind,
      delta_minor: alt.delta_minor ?? null,
      currency: alt.currency ?? null,
    })),
  };
}

export async function runPitchCase(raw: unknown, options: StreamRunOptions): Promise<CaseReport> {
  const c = pitchCase.parse(raw);
  const facts = pitchFactsFromCase(c.facts);
  const gateway = evalGateway(c.fixture, options);
  const lines: PitchModelSection[] = [];
  const failures: string[] = [];
  let rawText = '';
  const recording = {
    ...gateway,
    async *streamModel(...args: Parameters<typeof gateway.streamModel>) {
      for await (const event of gateway.streamModel(...args)) {
        if (
          event.kind === 'delta' &&
          event.event.type === 'content_block_delta' &&
          event.event.delta.type === 'text_delta'
        ) {
          rawText += event.event.delta.text;
        }
        yield event;
      }
    },
    callModel: () => {
      failures.push('a section was dropped and asked for again');
      return Promise.reject(new Error('no second call in this suite'));
    },
  };
  try {
    for await (const line of streamPitch(recording, facts)) lines.push(line);
  } catch (error) {
    if (failures.length === 0) failures.push(`stream failed: ${String(error)}`);
  }
  // Grounding: no line the model wrote may carry a number or month the tools did not return (a
  // line dropped only for its length is the validator doing its job, not a grounding miss).
  for (const line of rawText.split('\n').filter((l) => l.trim() !== '')) {
    const loose = pitchUngroundedTokens(line.replace(/"tag":"[^"]*"/gu, ''), facts);
    if (loose.length > 0) failures.push(`ungrounded ${loose.join(', ')}`);
  }
  const reasons = lines.filter((line) => line.s === 'reason').length;
  if (!lines.some((line) => line.s === 'headline')) failures.push('no headline');
  if (!lines.some((line) => line.s === 'quote')) failures.push('no quote');
  if (reasons < 2) failures.push(`${reasons} reasons`);
  const text = lines.map((line) => line.text).join(' ');
  const lower = text.toLowerCase();
  for (const word of c.must) if (!text.includes(word)) failures.push(`no ${word}`);
  for (const word of [...c.forbid, ...ALWAYS_FORBIDDEN]) {
    if (lower.includes(word.toLowerCase())) failures.push(`forbidden ${word}`);
  }
  return report(`${c.fixture}: ${c.facts.place.name}`, failures, JSON.stringify(lines));
}
