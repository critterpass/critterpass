/**
 * The `destination-critter` eval suite (`pnpm --filter @cp/ai eval destination-critter`):
 * destinations the nearest-critter rule left open (cases.yaml) run through the real
 * `chooseDestinationCritter` (questions, Jev client, confidence floor); only Jev's network boundary
 * replays (`recorded.json`, keyed by request like the compliance suite). A case passes when the
 * critter the destination ends with (the confident pick, else the nearest option) is one a person
 * would accept.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import { chooseDestinationCritter, type CritterChoice } from '../../src/routes/destination-critter';
import { requestKey } from '../lib/compliance';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, suiteReport } from '../search-parse/recorded-model';

export const DESTINATION_CRITTER_SUITE = 'destination-critter';

const RECORDED = fileURLToPath(new URL('./recorded.json', import.meta.url));
const CASES = fileURLToPath(new URL('./cases.yaml', import.meta.url));

const caseSchema = z.object({
  id: z.string().regex(/^critter-\d{2}$/u),
  description: z.string(),
  destination: z.object({
    name: z.string(),
    country: z.string(),
    region: z.string().nullable(),
    kind: z.string(),
  }),
  options: z
    .array(
      z.object({
        key: z.string(),
        home: z.string(),
        country: z.string(),
        distance_km: z.number(),
      }),
    )
    .min(2)
    .max(4),
  accept: z.array(z.string()).min(1),
});
type CritterCase = z.infer<typeof caseSchema>;

export interface DestinationCritterSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly typesafeKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadCritterCases(): CritterCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8')) as unknown);
}

/** An unsure answer leaves the destination with its nearest option, as the matcher does. */
export function gradeCritter(c: CritterCase, choice: CritterChoice): string[] {
  const nearest = [...c.options].sort((a, b) => a.distance_km - b.distance_km)[0]?.key;
  const given = choice.critterKey ?? nearest;
  if (given !== undefined && c.accept.includes(given)) return [];
  return choice.critterKey === null
    ? [`unsure (${choice.confidence.toFixed(2)}), nearest ${String(nearest)} not accepted`]
    : [`picked ${choice.critterKey}`];
}

type Recordings = Record<string, unknown>;

const bodyOf = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '{}';

function jevFetch(mode: EvalMode, recordings: Recordings, record: boolean): typeof fetch {
  if (mode === 'replay') {
    return (_input, init) => {
      const body = recordings[requestKey(bodyOf(init))];
      if (body === undefined) return Promise.reject(new Error('no recorded Jev response'));
      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    };
  }
  return async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.text();
    if (record && response.ok) recordings[requestKey(bodyOf(init))] = JSON.parse(text) as unknown;
    return new Response(text, { status: response.status, headers: response.headers });
  };
}

export async function runDestinationCritterSuite(
  options: DestinationCritterSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const live = options.mode === 'live';
  if (live && options.typesafeKey === undefined) {
    throw new Error('a live destination-critter run needs TYPESAFE_API_KEY');
  }
  const recordings: Recordings = live
    ? {}
    : (JSON.parse(readFileSync(RECORDED, 'utf8')) as Recordings);
  const gateway =
    live && options.apiKey !== undefined
      ? createGateway({
          apiKey: options.apiKey,
          ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        })
      : undefined;
  const decisions = createDecisionClient({
    apiKey: live ? options.typesafeKey : 'replay-key',
    ...(gateway === undefined ? {} : { gateway }),
    fetch: jevFetch(options.mode, recordings, options.record === true),
    ...(live ? { timeoutMs: 10_000 } : { timeoutMs: 60_000 }),
  });
  const reports = [];
  for (const c of loadCritterCases()) {
    const choice = await chooseDestinationCritter(
      decisions,
      c.destination,
      c.options.map((option) => ({
        key: option.key,
        home: option.home,
        country: option.country,
        distanceKm: option.distance_km,
      })),
    );
    reports.push(
      caseReport(
        DESTINATION_CRITTER_SUITE,
        `${c.id}: ${c.description}`,
        gradeCritter(c, choice),
        `${choice.critterKey ?? 'none'} (${choice.answeredBy}, ${choice.confidence.toFixed(2)})`,
      ),
    );
  }
  if (live && options.record === true) {
    writeFileSync(RECORDED, `${JSON.stringify(recordings, null, 2)}\n`);
  }
  return suiteReport(DESTINATION_CRITTER_SUITE, options.mode, threshold, reports);
}
