/**
 * Import command payloads (docs/api-contracts.md §4.10, doc delta: client candidate ids, the scan's
 * barcode, the resolve's split and travellers) and the boarding-pass merge a scan needs.
 */
import { z } from 'zod';

import { flightDate, type BcbpPass } from '../bcbp/decode';
import { bookingSplitSchema } from './booking-schema';
import type { ExtractedBooking } from './extracted';
import { barcodeFormatSchema, bookingVisibilitySchema } from './kinds';

export const importPastePayloadSchema = z
  .object({
    /** Client UUIDv7: the candidate row appears `parsing` at once and fills in. */
    candidate_id: z.uuid(),
    trip_id: z.uuid().optional(),
    text: z.string().trim().min(1).max(20_000).optional(),
    url: z
      .url({ protocol: /^https?$/u })
      .max(2000)
      .optional(),
  })
  .refine((value) => (value.text === undefined) !== (value.url === undefined), {
    message: 'paste text or a link, not both',
  });
export type ImportPastePayload = z.infer<typeof importPastePayloadSchema>;

export const importScanPayloadSchema = z
  .object({
    candidate_id: z.uuid(),
    trip_id: z.uuid().optional(),
    /** On-device OCR lines, top to bottom. */
    ocr_lines: z.array(z.string().max(500)).max(400).default([]),
    barcode: z
      .object({ format: barcodeFormatSchema, payload: z.string().min(1).max(4000) })
      .optional(),
    media_id: z.string().max(300).optional(),
  })
  .refine((value) => value.ocr_lines.length > 0 || value.barcode !== undefined, {
    message: 'a scan needs text or a barcode',
  });
export type ImportScanPayload = z.infer<typeof importScanPayloadSchema>;

export const resolveImportCandidatePayloadSchema = z.object({
  candidate_id: z.uuid(),
  action: z.enum(['add', 'ignore']),
  /** Add to this trip (default: the candidate's own). */
  trip_id: z.uuid().optional(),
  /** Client id of the booking to create (offline-safe); default: the candidate's id. */
  booking_id: z.uuid().optional(),
  traveller_ids: z.array(z.uuid()).min(1).max(32).optional(),
  visibility: bookingVisibilitySchema.optional(),
  /** "Split {n} ways" on ADD. */
  split: bookingSplitSchema.optional(),
});
export type ResolveImportCandidatePayload = z.infer<typeof resolveImportCandidatePayloadSchema>;

/** The `import.parse` job: what a paste or scan hands the worker (text never stored in a row). */
export const importParseJobSchema = z.object({
  candidate_id: z.uuid(),
  kind: z.enum(['paste', 'scan']),
  text: z.string().max(20_000).optional(),
  url: z.string().max(2000).optional(),
  barcode: z.object({ format: barcodeFormatSchema, payload: z.string().max(4000) }).optional(),
});
export type ImportParseJob = z.infer<typeof importParseJobSchema>;

/**
 * A scanned boarding pass joined to the flight the text read: each leg whose carrier and number
 * match a segment gives that booking its seat, its booking reference when the text had none, and
 * the barcode. Returns the bookings and whether any leg matched.
 */
export function mergeBoardingPass(
  bookings: readonly ExtractedBooking[],
  pass: BcbpPass,
  barcode: NonNullable<ExtractedBooking['barcode']>,
  readOn: Date,
): { bookings: ExtractedBooking[]; matched: boolean } {
  let matched = false;
  const merged = bookings.map((booking) => {
    if (booking.kind !== 'flight') return booking;
    const leg = pass.legs.find((candidate) =>
      booking.segments.some(
        (segment) =>
          segment.carrier === candidate.carrier &&
          segment.flight_no === candidate.flightNumber &&
          segment.sched_dep_at.slice(0, 10) <= flightDate(candidate.julianDate, readOn) &&
          flightDate(candidate.julianDate, readOn) <=
            new Date(Date.parse(segment.sched_dep_at) + 86_400_000).toISOString().slice(0, 10),
      ),
    );
    if (leg === undefined) return booking;
    matched = true;
    return {
      ...booking,
      supplier_ref: booking.supplier_ref ?? (leg.pnr === '' ? null : leg.pnr),
      details: { ...booking.details, ...(leg.seat === '' ? {} : { seat: leg.seat.slice(0, 8) }) },
      barcode,
      extracted_by: booking.extracted_by,
    };
  });
  return { bookings: merged, matched };
}
