/**
 * Reading a receipt: an optional server transcription of the photo, then the line-id-keyed parse,
 * validated against the OCR text. A refusal, an unparseable reply or a failed call answers
 * `failed` with no lines, so the app offers the manual paths (type the lines, split the total
 * evenly) instead of guessing.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import {
  buildReceiptParseRequest,
  buildReceiptTranscribeRequest,
  RECEIPT_PARSE_ROUTE,
} from './prompt';
import {
  receiptReplySchema,
  transcribeReplySchema,
  validateReceiptReply,
  type OcrLine,
  type ParsedReceipt,
  type ValidateOptions,
} from './schema';

export * from './prompt';
export * from './schema';

type ModelCaller = Pick<Gateway, 'callModel'>;

export interface ParseReceiptInput extends ValidateOptions {
  readonly lines: readonly OcrLine[];
}

function failed(input: ParseReceiptInput): ParsedReceipt {
  return {
    merchant: null,
    datetime: null,
    currency: input.currencyHint,
    lines: [],
    total_minor: null,
    total_line_id: null,
    lines_total_minor: 0,
    matches_total: false,
    rejected_line_ids: [],
    review_line_ids: [],
    status: 'failed',
  };
}

export async function parseReceipt(
  gateway: ModelCaller,
  input: ParseReceiptInput,
  context: UsageContext = {},
): Promise<ParsedReceipt> {
  if (input.lines.length === 0) return failed(input);
  try {
    const result = await gateway.callModel(
      RECEIPT_PARSE_ROUTE,
      buildReceiptParseRequest({ lines: input.lines, currencyHint: input.currencyHint }),
      context,
    );
    if (isDeclined(result.message)) return failed(input);
    const reply = receiptReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    return reply.success ? validateReceiptReply(reply.data, input.lines, input) : failed(input);
  } catch {
    return failed(input);
  }
}

/** Server OCR for a photo the device could not read; lines are `s0`, `s1`, … (empty on failure). */
export async function transcribeReceipt(
  gateway: ModelCaller,
  image: Parameters<typeof buildReceiptTranscribeRequest>[0],
  context: UsageContext = {},
): Promise<OcrLine[]> {
  try {
    const result = await gateway.callModel(
      RECEIPT_PARSE_ROUTE,
      buildReceiptTranscribeRequest(image),
      context,
    );
    const reply = transcribeReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return [];
    return reply.data.lines
      .map((text) => text.trim())
      .filter((text) => text !== '')
      .map((text, index) => ({ id: `s${index}`, text }));
  } catch {
    return [];
  }
}
