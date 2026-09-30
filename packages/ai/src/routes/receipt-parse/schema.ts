/**
 * The receipt parse contract. The model reads the OCR lines and answers, per line id, what the line
 * is and the amount exactly as printed on it; code never takes its number. Each amount must appear
 * verbatim in the text of the line it cites and is re-parsed from there with the receipt's number
 * conventions ("850.000" is 850000 in rupiah, "13,34" is 13.34 in euro); a line whose amount is not
 * in its line is rejected. The lines are then reconciled with the printed total (`reconcile.ts`).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { linesSum, reconcileWithTotal } from './reconcile';

export const RECEIPT_LINE_KINDS = ['item', 'service', 'tax', 'discount', 'tip'] as const;
export type ReceiptLineKind = (typeof RECEIPT_LINE_KINDS)[number];

export interface OcrLine {
  readonly id: string;
  readonly text: string;
}

export const RECEIPT_PARSE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['merchant', 'datetime', 'currency', 'lines', 'total'],
    properties: {
      merchant: { type: ['string', 'null'] },
      datetime: { type: ['string', 'null'] },
      currency: { type: ['string', 'null'] },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['line_id', 'label', 'qty', 'amount', 'kind'],
          properties: {
            line_id: { type: 'string' },
            label: { type: 'string' },
            qty: { type: ['integer', 'null'] },
            amount: { type: 'string' },
            kind: { type: 'string', enum: [...RECEIPT_LINE_KINDS] },
          },
        },
      },
      total: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['line_id', 'amount'],
        properties: { line_id: { type: 'string' }, amount: { type: 'string' } },
      },
    },
  },
};

export const receiptReplySchema = z.object({
  merchant: z.string().nullable(),
  datetime: z.string().nullable(),
  currency: z.string().nullable(),
  lines: z
    .array(
      z.object({
        line_id: z.string(),
        label: z.string(),
        /** A weight ("0.5" kg) is not a count: validation keeps whole numbers only. */
        qty: z.number().nullable(),
        amount: z.string(),
        kind: z.enum(RECEIPT_LINE_KINDS),
      }),
    )
    .max(200),
  total: z.object({ line_id: z.string(), amount: z.string() }).nullable(),
});
export type ReceiptReply = z.infer<typeof receiptReplySchema>;

/** The server-side transcription (a photo the device could not read): lines `s0`, `s1`, … */
export const RECEIPT_TRANSCRIBE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: { lines: { type: 'array', items: { type: 'string' } } },
  },
};
export const transcribeReplySchema = z.object({ lines: z.array(z.string().max(200)).max(200) });

/**
 * Parses an amount as printed into minor units: the last `.` or `,` followed by one or two digits
 * is the decimal point; any other separator (or one followed by three digits) groups thousands.
 * In a currency printed with cents, a space before the last two digits is the decimal point.
 * Returns `null` for anything that is not a plain amount.
 */
export function parsePrintedAmount(printed: string, exponent: number): bigint | null {
  const trimmed = printed.trim();
  const negative = /^[-−(]/u.test(trimmed);
  // A currency mark and a sign may surround the number; anything else (an OCR "?", a letter in
  // the digits) means the amount was not read cleanly.
  const bare = trimmed
    .replace(/^[-−(]\s*/u, '')
    .replace(/\)$/u, '')
    .replace(/^(?:rp|rm|us\$|s\$|[$¥€£฿₫₩]|vnd|idr|thb|jpy|sgd|myr)\s*/iu, '')
    .replace(/\s*(?:đ|₫|vnd|円|บาท)$/iu, '')
    // Thousands grouped with spaces ("55 000", "1 250 000"), as Vietnamese tills print them.
    .replace(/^\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?=(?:[.,]\d{1,2})?$)/u, (grouped) =>
      grouped.replace(/[ \u00A0\u202F]/gu, ''),
    );
  // A decimal point the recogniser read as a space ("24 22"), in a currency printed with cents.
  const spaced = exponent === 2 ? /^(\d{1,3}) (\d{2})$/u.exec(bare) : null;
  if (spaced !== null) return parsePrintedAmount(`${spaced[1]}.${spaced[2]}`, exponent);
  if (!/^\d[\d.,]*$/u.test(bare)) return null;
  const decimal = /[.,](\d{1,2})$/u.exec(bare);
  const whole = (decimal === null ? bare : bare.slice(0, decimal.index)).replace(/[.,]/gu, '');
  if (whole.length > 13) return null;
  const fraction = (decimal?.[1] ?? '').padEnd(exponent, '0');
  if (fraction.length > exponent && /[1-9]/u.test(fraction.slice(exponent))) return null;
  const kept = fraction.slice(0, exponent);
  const minor =
    BigInt(whole === '' ? '0' : whole) * 10n ** BigInt(exponent) + BigInt(kept === '' ? '0' : kept);
  return negative ? -minor : minor;
}

const squash = (text: string) => text.replace(/\s+/gu, '');

export interface ParsedReceiptLine {
  readonly line_id: string;
  readonly label: string;
  readonly qty: number | null;
  readonly amount_minor: number;
  readonly kind: ReceiptLineKind;
}

export interface ParsedReceipt {
  readonly merchant: string | null;
  readonly datetime: string | null;
  readonly currency: string;
  readonly lines: readonly ParsedReceiptLine[];
  readonly total_minor: number | null;
  readonly total_line_id: string | null;
  /** Items, service, tax and tip less discounts, over the lines that validated. */
  readonly lines_total_minor: number;
  readonly matches_total: boolean;
  /** Lines the model named whose amount was not on the cited line (or the line does not exist). */
  readonly rejected_line_ids: readonly string[];
  /** When the lines still miss the total: the lines most likely wrong, for the reviewer. */
  readonly review_line_ids: readonly string[];
  readonly status: 'parsed' | 'partial' | 'failed';
}

export interface ValidateOptions {
  /** The currency to read amounts in when the model names none (the trip's local currency). */
  readonly currencyHint: string;
  readonly exponentOf: (currency: string) => number | undefined;
}

/** The amount as printed on `line`, or `null` when the line does not carry it. */
function amountOnLine(line: OcrLine | undefined, printed: string, exponent: number) {
  if (line === undefined || printed.trim() === '') return null;
  if (!squash(line.text).includes(squash(printed))) return null;
  return parsePrintedAmount(printed, exponent);
}

/**
 * The widest gap cash rounding leaves between the lines and the total, by currency: ringgit bills
 * round to the nearest 5 sen.
 */
const ROUNDING_TOLERANCE: Readonly<Record<string, number>> = { MYR: 2 };

/** How far from the cited line a price printed on its own line may sit. */
const PRICE_LINE_REACH = 3;

/** A line that prints nothing but one amount (a currency mark or a trailing `x` aside). */
const isPriceOnly = (text: string) =>
  /^[-−(]?\s*(?:rp|rm|us\$|s\$|[$¥€£฿₫₩]|vnd|idr|thb|jpy|sgd|myr)?\s*\d[\d.,\s]*\s*(?:đ|₫|vnd|円|บาท|x)?\)?$/iu.test(
    text.trim(),
  );

/**
 * The device recogniser often reads a price as its own line beside or under the item's name, and
 * the model then cites the name's line. The amount is taken from the nearest line within reach
 * that prints only that amount and that no other answer line claims; a total, a subtotal or an
 * item line printing the same number never lends it.
 */
function priceLineNear(
  ocrLines: readonly OcrLine[],
  cited: string,
  printed: string,
  claimed: ReadonlySet<string>,
): OcrLine | undefined {
  const at = ocrLines.findIndex((line) => line.id === cited);
  if (at === -1 || printed.trim() === '') return undefined;
  for (let step = 1; step <= PRICE_LINE_REACH; step += 1) {
    for (const index of [at + step, at - step]) {
      const line = ocrLines[index];
      if (line === undefined || claimed.has(line.id) || !isPriceOnly(line.text)) continue;
      if (squash(line.text).includes(squash(printed))) return line;
    }
  }
  return undefined;
}

/** Checks a model reply against the OCR lines; no number reaches the result unless it is printed. */
export function validateReceiptReply(
  reply: ReceiptReply,
  ocrLines: readonly OcrLine[],
  options: ValidateOptions,
): ParsedReceipt {
  const named = reply.currency?.toUpperCase() ?? null;
  const currency =
    named !== null && options.exponentOf(named) !== undefined ? named : options.currencyHint;
  const exponent = options.exponentOf(currency) ?? 2;
  const byId = new Map(ocrLines.map((line) => [line.id, line]));
  const lines: ParsedReceiptLine[] = [];
  const rejected: string[] = [];
  // A line id answered without its prefix ("12" for "l12") names the same line.
  const idOf = (id: string) => (byId.has(id) || !/^\d+$/u.test(id) ? id : `l${id}`);
  const claimed = new Set([
    ...reply.lines.map((line) => idOf(line.line_id)),
    ...(reply.total === null ? [] : [idOf(reply.total.line_id)]),
  ]);
  for (const line of reply.lines) {
    let lineId = idOf(line.line_id);
    let printed = amountOnLine(byId.get(lineId), line.amount, exponent);
    if (printed === null) {
      const near = priceLineNear(ocrLines, lineId, line.amount, claimed);
      if (near !== undefined) {
        claimed.add(near.id);
        lineId = near.id;
        printed = amountOnLine(near, line.amount, exponent);
      }
    }
    // A discount may be printed with its minus sign; every other charge is positive.
    const amount =
      printed !== null && line.kind === 'discount' && printed < 0n ? -printed : printed;
    if (amount === null || amount <= 0n) {
      rejected.push(line.line_id);
      continue;
    }
    lines.push({
      line_id: lineId,
      label: line.label.trim().slice(0, 80),
      qty: line.qty !== null && Number.isInteger(line.qty) ? line.qty : null,
      amount_minor: Number(amount),
      kind: line.kind,
    });
  }
  let totalLineId = reply.total === null ? null : idOf(reply.total.line_id);
  let totalAmount =
    reply.total === null || totalLineId === null
      ? null
      : amountOnLine(byId.get(totalLineId), reply.total.amount, exponent);
  if (reply.total !== null && totalLineId !== null && totalAmount === null) {
    const near = priceLineNear(ocrLines, totalLineId, reply.total.amount, claimed);
    if (near !== undefined) {
      totalLineId = near.id;
      totalAmount = amountOnLine(near, reply.total.amount, exponent);
    }
  }
  if (reply.total !== null && totalAmount === null) rejected.push(reply.total.line_id);
  const total = totalAmount === null || totalAmount <= 0n ? null : Number(totalAmount);
  const tolerance = ROUNDING_TOLERANCE[currency] ?? 0;
  const reconciled = reconcileWithTotal({
    lines,
    ocrLines,
    total,
    claimed: new Set([...claimed, ...(totalLineId === null ? [] : [totalLineId])]),
    priceOf: (line) => {
      if (!isPriceOnly(line.text)) return null;
      const amount = parsePrintedAmount(line.text.replace(/\s*x$/iu, ''), exponent);
      return amount === null ? null : Number(amount);
    },
    tolerance,
  });
  const linesTotal = linesSum(reconciled.lines);
  const matches = total !== null && Math.abs(linesTotal - total) <= tolerance;
  const hasItems = reconciled.lines.some((line) => line.kind === 'item');
  const status =
    total === null && !hasItems
      ? 'failed'
      : matches && rejected.length === 0
        ? 'parsed'
        : 'partial';
  return {
    merchant: reply.merchant?.trim().slice(0, 120) || null,
    datetime: reply.datetime?.trim().slice(0, 40) || null,
    currency,
    lines: reconciled.lines,
    total_minor: total,
    total_line_id: total === null ? null : totalLineId,
    lines_total_minor: linesTotal,
    matches_total: matches,
    rejected_line_ids: rejected,
    review_line_ids: matches ? [] : reconciled.review_line_ids,
    status,
  };
}
