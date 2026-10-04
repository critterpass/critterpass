/**
 * The `place-compromise` eval suite (`pnpm --filter @cp/ai eval place-compromise`): crews split on
 * Pura Lempuyang, Fushimi Inari at dawn and a Mỹ Khê beach day (cases.yaml), in English and
 * Vietnamese, some with instructions planted in a note, run through the real
 * `writePlaceCompromise` (persona, prompt, gateway, validator with its number and name guards);
 * only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when the guide's
 * two options are the expected candidates and none forbidden; seeded cases must be rejected.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import {
  checkPlaceCompromiseReply,
  COMPROMISE_KINDS,
  writePlaceCompromise,
  type PlaceCompromiseInput,
  type PlaceCompromiseResult,
} from '../../src/routes/place-compromise';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, recordedModel, suiteReport } from '../search-parse/recorded-model';

export const PLACE_COMPROMISE_SUITE = 'place-compromise';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const splitSchema = z.object({
  guide: personaIdSchema,
  place: z.string(),
  silent: z.array(z.string()),
  stances: z.array(
    z.object({
      name: z.string(),
      stance: z.enum(['want', 'rather_not']),
      note: z.string().nullable(),
    }),
  ),
  candidates: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(COMPROMISE_KINDS),
      place: z.string(),
      day: z.string(),
      starts_at: z.string(),
      ends_at: z.string().nullable(),
      attendees: z.array(z.string()),
      everyone: z.boolean(),
      going_count: z.number().int(),
      drive_minutes: z.number().int().nullable(),
      cost: z.string().nullable(),
      facts: z.array(z.string()),
    }),
  ),
});

const caseSchema = z.object({
  id: z.string().regex(/^compromise-\d{2}$/u),
  split: z.string(),
  locale: z.enum(['en', 'vi']),
  description: z.string(),
  notes: z.record(z.string(), z.string()).default({}),
  expect: z
    .object({ ids: z.array(z.string()).length(2), forbid_ids: z.array(z.string()).default([]) })
    .optional(),
  seeded: z.boolean().default(false),
  reply: z.unknown().optional(),
});
type CompromiseCase = z.infer<typeof caseSchema>;

const fileSchema = z.object({
  splits: z.record(z.string(), splitSchema),
  cases: z.array(caseSchema),
});

export interface PlaceCompromiseSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadPlaceCompromiseCases(): z.infer<typeof fileSchema> {
  return fileSchema.parse(parse(readFileSync(here('./cases.yaml'), 'utf8')) as unknown);
}

function inputOf(
  c: CompromiseCase,
  splits: z.infer<typeof fileSchema>['splits'],
): PlaceCompromiseInput {
  const split = splits[c.split];
  if (split === undefined) throw new Error(`${c.id}: unknown split ${c.split}`);
  return {
    guide: split.guide,
    locale: c.locale,
    placeName: split.place,
    silent: split.silent,
    stances: split.stances.map((stance) => ({
      ...stance,
      note: c.notes[stance.name] ?? stance.note,
    })),
    candidates: split.candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      placeName: candidate.place,
      day: candidate.day,
      startsAt: candidate.starts_at,
      endsAt: candidate.ends_at,
      attendees: candidate.attendees,
      everyone: candidate.everyone,
      goingCount: candidate.going_count,
      driveMinutes: candidate.drive_minutes,
      cost: candidate.cost,
      facts: candidate.facts,
    })),
  };
}

export function gradePlaceCompromise(c: CompromiseCase, result: PlaceCompromiseResult): string[] {
  if (c.seeded) return result.ok ? ['slip accepted'] : [];
  if (!result.ok) return [`rejected (${result.reason})`];
  const ids = result.options.map((option) => option.candidateId);
  const failures: string[] = [];
  const want = c.expect;
  if (want !== undefined) {
    if ([...ids].sort().join(',') !== [...want.ids].sort().join(',')) {
      failures.push(`picked ${ids.join(', ')}, expected ${want.ids.join(', ')}`);
    }
    for (const id of want.forbid_ids) if (ids.includes(id)) failures.push(`picked ${id}`);
  }
  return failures;
}

async function run(
  c: CompromiseCase,
  input: PlaceCompromiseInput,
  options: PlaceCompromiseSuiteOptions,
): Promise<PlaceCompromiseResult> {
  if (c.seeded) return checkPlaceCompromiseReply(c.reply, input);
  const model = recordedModel(resolve(here('./fixtures/'), `${c.id}.json`), options);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: model.fetch,
    maxAttempts: options.mode === 'replay' ? 1 : 3,
  });
  const result = await writePlaceCompromise(gateway, input);
  model.finish();
  return result;
}

export async function runPlaceCompromiseSuite(
  options: PlaceCompromiseSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const { splits, cases } = loadPlaceCompromiseCases();
  const reports = [];
  for (const c of cases) {
    const result = await run(c, inputOf(c, splits), options);
    const output = result.ok
      ? result.options.map((o) => `${o.candidateId}: ${o.title} | ${o.body}`).join(' || ')
      : `fallback (${result.reason})`;
    reports.push(
      caseReport(
        PLACE_COMPROMISE_SUITE,
        `${c.id}: ${c.description}`,
        gradePlaceCompromise(c, result),
        output,
      ),
    );
  }
  return suiteReport(PLACE_COMPROMISE_SUITE, options.mode, threshold, reports);
}
