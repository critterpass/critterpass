/**
 * `record_supplier_click` (docs/api-contracts.md §4.11): the app records a partner link click with
 * its own random sub id (so an offline tap can open `go.critterpass.app/r/{sub_id}` at once and the
 * bridge redirects once the click syncs); the server builds the partner link and answers it with
 * the disclosure the card shows.
 */
import { z } from 'zod';

import { affiliateDisclosureSchema } from './disclosure';
import { affiliatePartnerSchema, affiliateTargetKindSchema, SUB_ID_PATTERN } from './partners';

const isoDate = z.iso.date();

export const linkTargetSchema = z
  .object({
    kind: affiliateTargetKindSchema,
    /** A POI id, offer ref or route ref this link is for (kept with the click). */
    ref: z.string().trim().min(1).max(200),
    /** Place, property or product name the partner's search understands. */
    query: z.string().trim().min(1).max(200),
    check_in: isoDate.optional(),
    check_out: isoDate.optional(),
    date: isoDate.optional(),
    adults: z.number().int().min(1).max(30).optional(),
    rooms: z.number().int().min(1).max(15).optional(),
    page_url: z
      .url({ protocol: /^https$/ })
      .max(2048)
      .optional(),
  })
  .strict();
export type LinkTargetPayload = z.infer<typeof linkTargetSchema>;

export const recordSupplierClickPayloadSchema = z
  .object({
    sub_id: z.string().regex(SUB_ID_PATTERN),
    partner: affiliatePartnerSchema,
    trip_id: z.uuid().optional(),
    target: linkTargetSchema,
  })
  .strict();
export type RecordSupplierClickPayload = z.infer<typeof recordSupplierClickPayloadSchema>;

export const recordSupplierClickResultSchema = z.object({
  click_id: z.uuid(),
  sub_id: z.string(),
  url: z.url(),
  disclosure: affiliateDisclosureSchema,
});
export type RecordSupplierClickResult = z.infer<typeof recordSupplierClickResultSchema>;

/** The bridge link an offline tap opens; it redirects to the partner once the click syncs. */
export function bridgeUrl(subId: string, base = 'https://go.critterpass.app'): string {
  return `${base}/r/${subId}`;
}
