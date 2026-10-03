/**
 * The `album` eval suite (`pnpm --filter @cp/ai eval album`): the guide's album note (AI-35)
 * through the real `writeAlbumNote` for albums of every shape (cases/notes.yaml); only DeepSeek's
 * network boundary replays (`fixtures/<id>.json`). A case passes when the guide's own line came
 * back (not the template), every number in it is one the facts hold, it never says everyone is in
 * unless `everyone_in_three`, and nothing forbidden is repeated. Seeded cases (cases/seeded.yaml)
 * grade the guards on deliberate slips: a note's invented number or false "everyone", and a score
 * reply's invented photo ids and out-of-range scores.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AlbumNoteFacts } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import {
  albumNoteProblem,
  validAlbumScores,
  writeAlbumNote,
  type AlbumNoteResult,
} from '../../src/routes/album';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const ALBUM_SUITE = 'album';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases/', import.meta.url));
const EMOJI = /\p{Extended_Pictographic}/u;
const EVERYONE = /\b(everyone|everybody|all of you|each of you)\b/iu;

const factsSchema = z.object({
  picks: z.int(),
  photos: z.int(),
  per_person: z.int(),
  days: z.int(),
  blurry_skipped: z.int(),
  duplicates_skipped: z.int(),
  tagged_people: z.int(),
  people_in_three: z.int(),
  everyone_in_three: z.boolean(),
});

const caseSchema = z.object({
  id: z.string().regex(/^album-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  facts: factsSchema,
  forbid: z.array(z.string()).default([]),
  seeded: z.boolean().default(false),
  /** Seeded: the note the model "wrote", which the guard must refuse. */
  note: z.string().optional(),
  /** Seeded: a score reply and the photo ids sent, and the scores that must survive. */
  scores: z.unknown().optional(),
  photo_ids: z.array(z.string()).default([]),
  expect_scores: z.record(z.string(), z.number()).optional(),
});
type AlbumCase = z.infer<typeof caseSchema>;

export interface AlbumSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadAlbumCases(): AlbumCase[] {
  return readdirSync(CASES)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) =>
      z.array(caseSchema).parse(parse(readFileSync(resolve(CASES, file), 'utf8'))),
    );
}

function transport(c: AlbumCase, options: AlbumSuiteOptions): typeof fetch {
  const file = resolve(FIXTURES, `${c.id}.json`);
  if (options.mode === 'replay') {
    return () => {
      const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
        response: { status: number; body: unknown };
      };
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  return async (url, init) => {
    const response = await fetch(url, init);
    if (options.record === true) {
      const body = (await response.clone().json()) as unknown;
      mkdirSync(FIXTURES, { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}

function gradeSeeded(c: AlbumCase): string[] {
  const failures: string[] = [];
  const facts: AlbumNoteFacts = c.facts;
  if (c.note !== undefined && albumNoteProblem(c.note, facts) === null) {
    failures.push('slipped note accepted');
  }
  if (c.expect_scores !== undefined) {
    const scores = Object.fromEntries(validAlbumScores(c.scores, c.photo_ids));
    if (JSON.stringify(scores) !== JSON.stringify(c.expect_scores)) {
      failures.push(`scores kept ${JSON.stringify(scores)}`);
    }
  }
  return failures;
}

export function gradeAlbumNote(c: AlbumCase, result: AlbumNoteResult): string[] {
  const failures: string[] = [];
  if (result.fallbackUsed) failures.push(`template answered (${result.rejected ?? 'unknown'})`);
  const problem = albumNoteProblem(result.note, c.facts);
  if (problem !== null) failures.push(problem);
  if (EMOJI.test(result.note)) failures.push('emoji');
  if (!c.facts.everyone_in_three && EVERYONE.test(result.note)) failures.push('claims everyone');
  const lower = result.note.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runAlbumSuite(
  options: AlbumSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadAlbumCases()) {
    let failures: string[];
    let output: string;
    if (c.seeded) {
      failures = gradeSeeded(c);
      output = c.note ?? JSON.stringify(c.scores);
    } else {
      const gateway = createGateway({
        apiKey: options.apiKey ?? 'replay',
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        fetch: transport(c, options),
        maxAttempts: 1,
      });
      const result = await writeAlbumNote(gateway, { guide: c.guide, facts: c.facts });
      failures = gradeAlbumNote(c, result);
      output = result.note;
    }
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'album', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'album', outcome: 'fail' as const, reason })),
      output,
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: ALBUM_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
