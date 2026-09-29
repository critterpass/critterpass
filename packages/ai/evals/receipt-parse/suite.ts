/**
 * The receipt parse suite (cases in `cases/*.yaml`). Each case sends OCR lines through the real
 * `parseReceipt` (gateway, prompt, validator) with only DeepSeek's network boundary replayed, and
 * passes when every expected charge line comes back with its line id, kind and amount, nothing
 * else is taken as a charge, and the total reconciles as expected. `seeded` cases grade the
 * validator on a deliberate model slip (an inline reply naming an amount its line does not print):
 * the slip must be rejected, in both modes.
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

const lineSchema = z.object({ id: z.string(), text: z.string() });
const expectSchema = z.object({
  currency: z.string().length(3),
  total_minor: z.int().nullable(),
  matches_total: z.boolean(),
  lines: z.array(
    z.object({
      line_id: z.string(),
      kind: z.enum(['item', 'service', 'tax', 'discount', 'tip']),
      amount_minor: z.int(),
    }),
  ),
  rejected: z.array(z.string()).default([]),
});
const caseSchema = z.object({
  description: z.string(),
  fixture: z.string().optional(),
  currency_hint: z.string().length(3),
  lines: z.array(lineSchema).min(1),
  /** A seeded model reply (graded in both modes, no model call). */
  reply: z.unknown().optional(),
  expect: expectSchema,
});

const CASES_DIR = fileURLToPath(new URL('./cases/', import.meta.url));

export function loadReceiptCases(): unknown[] {
  return readdirSync(CASES_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) => {
      const cases = parse(readFileSync(resolve(CASES_DIR, file), 'utf8')) as unknown;
      if (!Array.isArray(cases)) throw new Error(`receipt-parse: ${file} holds no case list`);
      return cases as unknown[];
    });
}

function grade(result: ParsedReceipt, expected: z.infer<typeof expectSchema>): string[] {
  const failures: string[] = [];
  if (result.currency !== expected.currency) {
    failures.push(`currency ${result.currency}, want ${expected.currency}`);
  }
  if (result.total_minor !== expected.total_minor) {
    failures.push(`total ${String(result.total_minor)}, want ${String(expected.total_minor)}`);
  }
  if (result.matches_total !== expected.matches_total) {
    failures.push(`lines ${result.matches_total ? 'match' : 'miss'} the total`);
  }
  const got = new Map(result.lines.map((line) => [line.line_id, line]));
  for (const want of expected.lines) {
    const line = got.get(want.line_id);
    if (line === undefined) failures.push(`missing ${want.line_id}`);
    else if (line.amount_minor !== want.amount_minor || line.kind !== want.kind) {
      failures.push(
        `${want.line_id}: ${line.kind} ${line.amount_minor}, want ${want.kind} ${want.amount_minor}`,
      );
    }
  }
  const extra = result.lines.filter((l) => !expected.lines.some((w) => w.line_id === l.line_id));
  if (extra.length > 0) failures.push(`extra ${extra.map((l) => l.line_id).join(', ')}`);
  for (const id of expected.rejected) {
    if (!result.rejected_line_ids.includes(id)) failures.push(`${id} not rejected`);
  }
  return failures;
}

export interface ReceiptSuiteDeps {
  readonly gatewayFor: (fixture: string) => Parameters<typeof parseReceipt>[0];
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

export async function runReceiptCase(raw: unknown, deps: ReceiptSuiteDeps): Promise<CaseReport> {
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
    result = await parseReceipt(deps.gatewayFor(c.fixture), options);
  }
  return deps.report(
    `${c.fixture ?? 'seeded'}: ${c.description}`,
    grade(result, c.expect),
    JSON.stringify(result),
  );
}
