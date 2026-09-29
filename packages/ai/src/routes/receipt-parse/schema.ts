/**
 * The receipt parse contract. The model reads the OCR lines and answers, per line id, what the line
 * is and the amount exactly as printed on it; code never takes its number. Each amount must appear
 * verbatim in the text of the line it cites and is re-parsed from there with the receipt's number
 * conventions ("850.000" is 850000 in rupiah, "13,34" is 13.34 in euro); a line whose amount is not
 * in its line is rejected. The lines are then checked against the printed total.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

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
        qty: z.int().nullable(),
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
    .replace(/\s*(?:đ|₫|vnd|円|บาท)$/iu, '');
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
  for (const line of reply.lines) {
    const printed = amountOnLine(byId.get(line.line_id), line.amount, exponent);
    // A discount may be printed with its minus sign; every other charge is positive.
    const amount =
      printed !== null && line.kind === 'discount' && printed < 0n ? -printed : printed;
    if (amount === null || amount <= 0n) {
      rejected.push(line.line_id);
      continue;
    }
    lines.push({
      line_id: line.line_id,
      label: line.label.trim().slice(0, 80),
      qty: line.qty,
      amount_minor: Number(amount),
      kind: line.kind,
    });
  }
  const totalAmount =
    reply.total === null
      ? null
      : amountOnLine(byId.get(reply.total.line_id), reply.total.amount, exponent);
  if (reply.total !== null && totalAmount === null) rejected.push(reply.total.line_id);
  const linesTotal = lines.reduce(
    (sum, line) => sum + (line.kind === 'discount' ? -line.amount_minor : line.amount_minor),
    0,
  );
  const total = totalAmount === null || totalAmount <= 0n ? null : Number(totalAmount);
  const matches = total !== null && linesTotal === total;
  const hasItems = lines.some((line) => line.kind === 'item');
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
    lines,
    total_minor: total,
    total_line_id: total === null ? null : (reply.total?.line_id ?? null),
    lines_total_minor: linesTotal,
    matches_total: matches,
    rejected_line_ids: rejected,
    status,
  };
}
