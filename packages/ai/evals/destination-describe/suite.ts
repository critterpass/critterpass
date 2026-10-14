/**
 * The `destination-describe` eval suite (`pnpm --filter @cp/ai eval destination-describe`):
 * base-set destinations (cases.yaml) run through the real `describeDestination` (prompt, gateway,
 * validator); only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when
 * both languages are written within their lengths with no number the facts lack; seeded slips (an
 * invented year, a rounded population) must be rejected.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  describeDestination,
  describeReplySchema,
  validateDescribeReply,
  type DescribeVerdict,
} from '../../src/routes/destination-describe';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, recordedModel, suiteReport } from '../search-parse/recorded-model';

export const DESTINATION_DESCRIBE_SUITE = 'destination-describe';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const caseSchema = z.object({
  id: z.string().regex(/^describe-\d{2}$/u),
  description: z.string(),
  facts: z.object({
    name: z.string(),
    local_name: z.string().nullable(),
    kind: z.string(),
    country: z.string(),
    region: z.string().nullable(),
    population: z.number().int().nullable(),
    elevation_m: z.number().int().nullable(),
  }),
  seeded: z.boolean().default(false),
  reply: describeReplySchema.optional(),
});
type DescribeCase = z.infer<typeof caseSchema>;

export interface DestinationDescribeSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadDescribeCases(): DescribeCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(here('./cases.yaml'), 'utf8')) as unknown);
}

export function gradeDescribe(c: DescribeCase, verdict: DescribeVerdict): string[] {
  if (c.seeded) return verdict.ok ? ['slip accepted'] : [];
  return verdict.ok ? [] : [`rejected (${verdict.reason})`];
}

async function run(
  c: DescribeCase,
  options: DestinationDescribeSuiteOptions,
): Promise<DescribeVerdict> {
  if (c.seeded) {
    if (c.reply === undefined) throw new Error(`${c.id}: a seeded case needs a reply`);
    return validateDescribeReply(c.reply, c.facts);
  }
  const model = recordedModel(resolve(here('./fixtures/'), `${c.id}.json`), options);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: model.fetch,
    maxAttempts: options.mode === 'replay' ? 1 : 3,
  });
  const { verdict } = await describeDestination(gateway, c.facts);
  model.finish();
  return verdict;
}

export async function runDestinationDescribeSuite(
  options: DestinationDescribeSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const reports = [];
  for (const c of loadDescribeCases()) {
    const verdict = await run(c, options);
    const output = verdict.ok
      ? [
          verdict.texts.en.line,
          verdict.texts.en.about,
          verdict.texts.vi.line,
          verdict.texts.vi.about,
        ].join(' | ')
      : `rejected (${verdict.reason})`;
    reports.push(
      caseReport(
        DESTINATION_DESCRIBE_SUITE,
        `${c.id}: ${c.description}`,
        gradeDescribe(c, verdict),
        output,
      ),
    );
  }
  return suiteReport(DESTINATION_DESCRIBE_SUITE, options.mode, threshold, reports);
}
