/**
 * Reading bookings out of a confirmation's text with the fast tier, then checking the answer
 * against the text (./schema.ts). A refusal, an unreadable reply or a failed call answers `failed`
 * with no bookings, so the app offers "add it by hand" instead of a guess.
 */
import type { ExtractedBooking } from '@cp/domain';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import {
  BOOKING_EXTRACT_ROUTE,
  buildBookingExtractRequest,
  type BookingExtractRequestInput,
} from './prompt';
import {
  bookingExtractReplySchema,
  validateExtraction,
  type ValidateExtractionOptions,
} from './schema';

export * from './prompt';
export * from './schema';

type ModelCaller = Pick<Gateway, 'callModel'>;

export type BookingExtractInput = BookingExtractRequestInput & ValidateExtractionOptions;

export type BookingExtractResult =
  | { readonly status: 'parsed'; readonly bookings: ExtractedBooking[] }
  | { readonly status: 'failed'; readonly reason: 'no_booking' | 'unreadable' };

export async function extractBookings(
  gateway: ModelCaller,
  input: BookingExtractInput,
  context: UsageContext = {},
): Promise<BookingExtractResult> {
  if (input.text.trim() === '') return { status: 'failed', reason: 'unreadable' };
  try {
    const result = await gateway.callModel(
      BOOKING_EXTRACT_ROUTE,
      buildBookingExtractRequest(input),
      context,
    );
    if (isDeclined(result.message)) return { status: 'failed', reason: 'unreadable' };
    const reply = bookingExtractReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return { status: 'failed', reason: 'unreadable' };
    const bookings = validateExtraction(reply.data, input.text, input);
    return bookings.length === 0
      ? { status: 'failed', reason: 'no_booking' }
      : { status: 'parsed', bookings };
  } catch {
    return { status: 'failed', reason: 'unreadable' };
  }
}
