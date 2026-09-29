/**
 * Receipt scan contracts (docs/api-contracts.md §5.3, §4.9): the upload of the device's OCR lines
 * (`POST /v1/receipts`), the validated parse and the split suggestions the server writes back onto
 * the synced `receipts` row, and `commit_receipt`, which turns the lines and who had each one into
 * an itemised expense. Amounts always come from the server's validated parse, never the client.
 */
import { z } from 'zod';

/** Vision calls a member may make on receipts per day before scans quietly go manual. */
export const RECEIPT_FAIR_USE_DAILY_CAP = 40;

export const RECEIPT_QUALITY_ISSUES = ['crumpled', 'blurry', 'glare', 'cut_off'] as const;
export const RECEIPT_STATUSES = ['queued', 'parsed', 'partial', 'failed', 'committed'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const ocrLineSchema = z.strictObject({
  /** `l{n}` top to bottom from the device; the server's own transcription uses `s{n}`. */
  id: z.string().regex(/^[ls]\d{1,3}$/u),
  text: z.string().max(200),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  conf: z.number().min(0).max(1).optional(),
});
export type OcrLineInput = z.infer<typeof ocrLineSchema>;

export const postReceiptBodySchema = z.strictObject({
  /** Client UUIDv7, so a scan queued offline keeps its id. */
  receipt_id: z.uuid(),
  trip_id: z.uuid(),
  /** The photo's key from `POST /v1/media/presign` (purpose `receipt`). */
  media_key: z.string().min(1).max(300).optional(),
  ocr_lines: z.array(ocrLineSchema).max(200),
  quality_issue: z.enum(RECEIPT_QUALITY_ISSUES).optional(),
  /** `unsupported_script`: the device could not read the script; the server transcribes the photo. */
  ocr_status: z.enum(['ok', 'unsupported_script', 'no_text']).default('ok'),
});
export type PostReceiptBody = z.infer<typeof postReceiptBodySchema>;

export interface PostReceiptResult {
  readonly receipt_id: string;
  /** `null` when the scan went straight to the manual paths (fair-use cap reached). */
  readonly job_id: string | null;
  readonly status: ReceiptStatus;
}

/** What the server suggests for one line, each with the reason the app shows. */
export interface ReceiptLineSuggestion {
  readonly line_id: string;
  /** Members suggested to leave out of the line ("NOT JORDAN"). */
  readonly exclude: readonly string[];
  readonly reasons: readonly {
    readonly user_id: string;
    readonly kind: 'dietary';
    /** The consented flag behind it (`halal`, `vegetarian`, `no_peanuts`, …). */
    readonly flag: string;
    /** What in the line it matched ("pork", "shellfish", …). */
    readonly food: string;
  }[];
}

export interface ReceiptSuggestions {
  readonly payer_uid: string;
  readonly payer_reason: 'scanned';
  /** Service, tax and tip lines are shared in proportion to each member's items. */
  readonly adjustments: 'by_share';
  readonly lines: readonly ReceiptLineSuggestion[];
}

export const commitReceiptPayloadSchema = z.strictObject({
  receipt_id: z.uuid(),
  /** The expense's id (client UUIDv7). */
  expense_id: z.uuid(),
  payer_uid: z.uuid(),
  /** Who had each item line; an empty or missing list means everyone. */
  lines: z
    .array(z.strictObject({ line_id: z.string(), assignment: z.array(z.uuid()).max(16) }))
    .max(200)
    .default([]),
  /** When the lines do not add up to the printed total: share the difference by share. */
  keep_total: z.boolean().default(false),
  category: z.enum(['stays', 'food', 'transit', 'fun', 'other']).default('food'),
});
export type CommitReceiptPayload = z.infer<typeof commitReceiptPayloadSchema>;
