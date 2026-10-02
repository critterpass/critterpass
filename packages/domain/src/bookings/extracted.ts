/**
 * What an import reads out of a confirmation (a forwarded email, a paste, a scan, a mailbox find):
 * one typed booking, in the shape `import_candidates.extracted` stores and `resolve_import_candidate`
 * turns into a wallet booking. Every field is what the user's own confirmation says; a field it
 * does not print stays empty. `cancel_policy_text` is copied verbatim from it.
 */
import { z } from 'zod';

import { bookingDetailsSchema, flightSegmentInputSchema } from './booking-schema';
import { bookingKindSchema, bookingSupplierSchema } from './kinds';

/**
 * Where the fields came from: schema.org markup, the model's read, a boarding pass barcode, or the
 * flight's published schedule (a flight number pasted on its own).
 */
export const EXTRACTION_SOURCES = ['jsonld', 'microdata', 'model', 'bcbp', 'schedule'] as const;

export const extractedBookingSchema = z.object({
  kind: bookingKindSchema,
  title: z.string().trim().min(1).max(140),
  supplier: bookingSupplierSchema,
  /** The seller's name as printed ("Agoda", "Singapore Airlines", "Ekajaya Fast Boat"). */
  supplier_name: z.string().max(120).nullable(),
  supplier_ref: z.string().trim().min(1).max(64).nullable(),
  starts_at: z.iso.datetime({ offset: true }).nullable(),
  ends_at: z.iso.datetime({ offset: true }).nullable(),
  tz: z.string().max(64).nullable(),
  location: z.string().max(300).nullable(),
  price: z
    .object({ amount_minor: z.int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/u) })
    .nullable(),
  /** Traveller names as printed (matched to crew members by the app, never stored on a booking). */
  travellers: z.array(z.string().max(80)).max(32),
  free_cancel_until: z.iso.datetime({ offset: true }).nullable(),
  cancel_policy_text: z.string().max(2000).nullable(),
  segments: z.array(flightSegmentInputSchema).max(8),
  details: bookingDetailsSchema,
  /** A boarding pass barcode read from a scan (sealed when the booking is added). */
  barcode: z
    .object({ format: z.enum(['pdf417', 'aztec', 'qr', 'code128']), payload: z.string().max(4000) })
    .nullable(),
  extracted_by: z.enum(EXTRACTION_SOURCES),
});
export type ExtractedBooking = z.infer<typeof extractedBookingSchema>;

/** An empty extraction of `kind`, for readers that fill fields one by one. */
export function emptyExtraction(
  kind: ExtractedBooking['kind'],
  title: string,
  extractedBy: ExtractedBooking['extracted_by'],
): ExtractedBooking {
  return {
    kind,
    title,
    supplier: kind === 'flight' ? 'airline' : 'other',
    supplier_name: null,
    supplier_ref: null,
    starts_at: null,
    ends_at: null,
    tz: null,
    location: null,
    price: null,
    travellers: [],
    free_cancel_until: null,
    cancel_policy_text: null,
    segments: [],
    details: {},
    barcode: null,
    extracted_by: extractedBy,
  };
}
