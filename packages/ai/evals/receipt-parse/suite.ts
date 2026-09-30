/**
 * The receipt parse suite (cases in `cases/*.yaml`). Each case sends OCR lines through the real
 * `parseReceipt` (gateway, prompt, validator) with only DeepSeek's network boundary replayed, and
 * passes when every expected charge line comes back with its line id, kind and amount, nothing
 * else is taken as a charge, and the total reconciles as expected. `seeded` cases grade the
 * validator on a deliberate model slip (an inline reply naming an amount its line does not print):
 * the slip must be rejected, in both modes.
 *
 * Photographed receipts (`fixtures/*.yaml`) carry the lines the device recogniser read from
 * the redacted photo in `apps/mobile/modules/cp-ocr/fixtures/` (in reading order, as the app sends
 * them) and are graded on what the paper prints: `amounts` lists every charge by kind and amount,
 * matched whichever line the model cites (the validator already holds each amount to its line), so
 * an OCR misreading counts against the result like any other miss. A charge that honestly reads
 * two ways lists both kinds; a charge a reader may leave out (a rounding line) is `optional`; a
 * total that cannot be read with certainty is left out and named in `excluded`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import {
  parseReceipt,
  receiptReplySchema,
  validateReceiptReply,
  type ParsedReceipt,
} from '../../src/routes/receipt-parse';
import type { CaseReport } from '../lib/runner';

/** ISO 4217 exponents (as `@cp/cost-engine` keeps them: rupiah in sen, yen and dong whole). */
const EXPONENTS: Readonly<Record<string, number>> = {
  IDR: 2,
  JPY: 0,
  VND: 0,
  KRW: 0,
  THB: 2,
  SGD: 2,
  MYR: 2,
  USD: 2,
  EUR: 2,
};

const kindSchema = z.enum(['item', 'service', 'tax', 'discount', 'tip']);
const lineSchema = z.object({ id: z.string(), text: z.string() });
const amountSchema = z.object({
  kind: kindSchema.optional(),
  /** Kinds that are all right for a charge that reads two ways ("Service Tax"). */
  kinds: z.array(kindSchema).min(2).optional(),
  amount_minor: z.int(),
  /** A charge the model may leave out without a miss (a rounding line). */
  optional: z.boolean().default(false),
});
const expectSchema = z.object({
  currency: z.string().length(3),
  /** Left out when the paper's total cannot be read with certainty. */
  total_minor: z.int().nullable().optional(),
  matches_total: z.boolean().optional(),
  lines: z
    .array(z.object({ line_id: z.string(), kind: kindSchema, amount_minor: z.int() }))
    .default([]),
  /**
   * Every charge the paper prints, matched by kind and amount on whichever line is cited; `null`
   * when the charges cannot be read with certainty (only the currency and total are graded).
   */
  amounts: z.array(amountSchema).nullable().optional(),
  rejected: z.array(z.string()).default([]),
});
const caseSchema = z.object({
  description: z.string(),
  fixture: z.string().optional(),
  /** The redacted photo the lines were read from, under `apps/mobile/modules/cp-ocr/fixtures/`. */
  photo: z.string().optional(),
  /** Where the receipt is from, for per-country accuracy ("synthetic" for hand-written cases). */
  country: z.string().default('synthetic'),
  currency_hint: z.string().length(3),
  lines: z.array(lineSchema).min(1),
  /** A seeded model reply (graded in both modes, no model call). */
  reply: z.unknown().optional(),
  expect: expectSchema,
  /** What is left ungraded because the paper does not settle it, with the reason. */
  excluded: z.array(z.string()).default([]),
});

const CASES_DIR = fileURLToPath(new URL('./cases/', import.meta.url));
const PHOTOS_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

function casesIn(dir: string): unknown[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) => {
      const cases = parse(readFileSync(resolve(dir, file), 'utf8')) as unknown;
      if (!Array.isArray(cases)) throw new Error(`receipt-parse: ${file} holds no case list`);
      return cases as unknown[];
    });
}

/**
 * The suite's cases. The photographed receipts in `fixtures/` join when `EVAL_RECEIPT_PHOTOS=1` (or
 * `photos` is set): they measure the device-OCR-to-parse path on real paper, which does not yet
 * meet its gate, so they stay out of the every-change replay gate and are scored on their own by
 * `line-accuracy.ts`.
 */
export function loadReceiptCases(photos = process.env.EVAL_RECEIPT_PHOTOS === '1'): unknown[] {
  return [...casesIn(CASES_DIR), ...(photos ? casesIn(PHOTOS_DIR) : [])];
}

interface Graded {
  readonly failures: string[];
  /** Charge lines the paper prints (or the case names) that came back right. */
  readonly correct: number;
  /** Required charge lines plus charges claimed that the paper does not print. */
  readonly counted: number;
}

function gradeAmounts(
  result: ParsedReceipt,
  amounts: readonly z.infer<typeof amountSchema>[],
): Graded {
  const failures: string[] = [];
  const unmatched = [...result.lines];
  let correct = 0;
  for (const want of amounts) {
    const kinds = want.kinds ?? (want.kind === undefined ? [] : [want.kind]);
    const at = unmatched.findIndex(
      (line) => line.amount_minor === want.amount_minor && kinds.includes(line.kind),
    );
    if (at !== -1) {
      unmatched.splice(at, 1);
      if (!want.optional) correct += 1;
    } else if (!want.optional) {
      failures.push(`missing ${kinds.join('/')} ${want.amount_minor}`);
    }
  }
  for (const line of unmatched) {
    failures.push(`extra ${line.line_id} ${line.kind} ${line.amount_minor}`);
  }
  const required = amounts.filter((want) => !want.optional).length;
  return { failures, correct, counted: required + unmatched.length };
}

function gradeLines(result: ParsedReceipt, expected: z.infer<typeof expectSchema>): Graded {
  const failures: string[] = [];
  const got = new Map(result.lines.map((line) => [line.line_id, line]));
  let correct = 0;
  for (const want of expected.lines) {
    const line = got.get(want.line_id);
    if (line === undefined) failures.push(`missing ${want.line_id}`);
    else if (line.amount_minor !== want.amount_minor || line.kind !== want.kind) {
      failures.push(
        `${want.line_id}: ${line.kind} ${line.amount_minor}, want ${want.kind} ${want.amount_minor}`,
      );
    } else correct += 1;
  }
  const extra = result.lines.filter((l) => !expected.lines.some((w) => w.line_id === l.line_id));
  if (extra.length > 0) failures.push(`extra ${extra.map((l) => l.line_id).join(', ')}`);
  return { failures, correct, counted: expected.lines.length + extra.length };
}

function grade(result: ParsedReceipt, expected: z.infer<typeof expectSchema>): Graded {
  const failures: string[] = [];
  if (result.currency !== expected.currency) {
    failures.push(`currency ${result.currency}, want ${expected.currency}`);
  }
  if (expected.total_minor !== undefined && result.total_minor !== expected.total_minor) {
    failures.push(`total ${String(result.total_minor)}, want ${String(expected.total_minor)}`);
  }
  if (expected.matches_total !== undefined && result.matches_total !== expected.matches_total) {
    failures.push(`lines ${result.matches_total ? 'match' : 'miss'} the total`);
  }
  const lines =
    expected.amounts === null
      ? { failures: [], correct: 0, counted: 0 }
      : expected.amounts === undefined
        ? gradeLines(result, expected)
        : gradeAmounts(result, expected.amounts);
  failures.push(...lines.failures);
  for (const id of expected.rejected) {
    if (!result.rejected_line_ids.includes(id)) failures.push(`${id} not rejected`);
  }
  return { failures, correct: lines.correct, counted: lines.counted };
}

export interface ReceiptGrade extends Graded {
  readonly description: string;
  readonly country: string;
  readonly output: string;
}

export async function gradeReceiptCase(
  raw: unknown,
  gatewayFor: (fixture: string) => Parameters<typeof parseReceipt>[0],
): Promise<ReceiptGrade> {
  const c = caseSchema.parse(raw);
  const options = {
    lines: c.lines,
    currencyHint: c.currency_hint,
    exponentOf: (currency: string) => EXPONENTS[currency],
  };
  let result: ParsedReceipt;
  if (c.reply !== undefined) {
    result = validateReceiptReply(receiptReplySchema.parse(c.reply), c.lines, options);
  } else {
    if (c.fixture === undefined) throw new Error(`receipt-parse: ${c.description} has no fixture`);
    result = await parseReceipt(gatewayFor(c.fixture), options);
  }
  return {
    description: `${c.fixture ?? 'seeded'}: ${c.description}`,
    country: c.country,
    output: JSON.stringify(result),
    ...grade(result, c.expect),
  };
}

export interface ReceiptSuiteDeps {
  readonly gatewayFor: (fixture: string) => Parameters<typeof parseReceipt>[0];
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

export async function runReceiptCase(raw: unknown, deps: ReceiptSuiteDeps): Promise<CaseReport> {
  const graded = await gradeReceiptCase(raw, deps.gatewayFor);
  return deps.report(graded.description, graded.failures, graded.output);
}
