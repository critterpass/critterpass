/**
 * The `link-extract` eval suite (`pnpm --filter @cp/ai eval link-extract`): TikTok, YouTube and
 * Instagram post text and Google Maps screenshots read by OCR (cases.yaml), in English and
 * Vietnamese, run through the real `extractPlaceMentions` (prompt, gateway, source-text
 * validator); only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when
 * the status is right, every expected place is among the mentions and nothing forbidden is.
 * Seeded cases grade the validator on an inline reply that names places the post never does.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  checkLinkExtractReply,
  extractPlaceMentions,
  linkSourceText,
  LINK_PLATFORMS,
  squash,
  type LinkExtractInput,
  type LinkExtractResult,
} from '../../src/routes/link-extract';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, recordedModel, suiteReport } from '../search-parse/recorded-model';

export const LINK_EXTRACT_SUITE = 'link-extract';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const caseSchema = z.object({
  id: z.string().regex(/^link-\d{2}$/u),
  description: z.string(),
  trip: z.string(),
  post: z
    .object({
      platform: z.enum(LINK_PLATFORMS),
      author: z.string().nullable(),
      title: z.string().nullable(),
      text: z.string(),
    })
    .optional(),
  ocr: z.array(z.string()).optional(),
  expect: z.object({
    status: z.enum(['found', 'other_destination', 'none']),
    labels: z.array(z.string()).default([]),
    forbid: z.array(z.string()).default([]),
    max: z.number().optional(),
  }),
  seeded: z.boolean().default(false),
  reply: z.unknown().optional(),
});
type LinkCase = z.infer<typeof caseSchema>;

const fileSchema = z.object({
  trips: z.record(z.string(), z.object({ destination: z.string(), areas: z.array(z.string()) })),
  cases: z.array(caseSchema),
});

export interface LinkExtractSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadLinkExtractCases(): z.infer<typeof fileSchema> {
  return fileSchema.parse(parse(readFileSync(here('./cases.yaml'), 'utf8')) as unknown);
}

function inputOf(c: LinkCase, trips: z.infer<typeof fileSchema>['trips']): LinkExtractInput {
  const trip = trips[c.trip];
  if (trip === undefined) throw new Error(`${c.id}: unknown trip ${c.trip}`);
  const source: LinkExtractInput['source'] =
    c.post !== undefined
      ? { kind: 'post', url: `https://example.com/${c.id}`, ...c.post }
      : { kind: 'screenshot', lines: c.ocr ?? [] };
  return { source, destination: trip.destination, areas: trip.areas };
}

const matches = (want: string, got: string): boolean => {
  const a = squash(want);
  const b = squash(got);
  return a.includes(b) || b.includes(a);
};

export function gradeLinkExtract(c: LinkCase, result: LinkExtractResult): string[] {
  const failures: string[] = [];
  if (result.status !== c.expect.status) {
    failures.push(`status ${result.status}, expected ${c.expect.status}`);
  }
  const labels = result.mentions.map((mention) => mention.label);
  for (const want of c.expect.labels) {
    if (!labels.some((label) => matches(want, label))) failures.push(`missing "${want}"`);
  }
  for (const banned of c.expect.forbid) {
    if (labels.some((label) => matches(banned, label))) failures.push(`listed "${banned}"`);
  }
  if (c.expect.max !== undefined && labels.length > c.expect.max) {
    failures.push(`${labels.length} mentions, at most ${c.expect.max}`);
  }
  return failures;
}

async function run(
  c: LinkCase,
  input: LinkExtractInput,
  options: LinkExtractSuiteOptions,
): Promise<LinkExtractResult> {
  if (c.seeded) return checkLinkExtractReply(c.reply, linkSourceText(input.source));
  const model = recordedModel(resolve(here('./fixtures/'), `${c.id}.json`), options);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: model.fetch,
    maxAttempts: options.mode === 'replay' ? 1 : 3,
  });
  const result = await extractPlaceMentions(gateway, input);
  model.finish();
  return result;
}

export async function runLinkExtractSuite(
  options: LinkExtractSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const { trips, cases } = loadLinkExtractCases();
  const reports = [];
  for (const c of cases) {
    const result = await run(c, inputOf(c, trips), options);
    const output =
      result.status === 'found'
        ? result.mentions.map((m) => `${m.label} (${m.kind_hint})`).join(' · ')
        : result.status === 'none'
          ? `none (${result.reason})`
          : result.status;
    reports.push(
      caseReport(
        LINK_EXTRACT_SUITE,
        `${c.id}: ${c.description}`,
        gradeLinkExtract(c, result),
        output,
      ),
    );
  }
  return suiteReport(LINK_EXTRACT_SUITE, options.mode, threshold, reports);
}
