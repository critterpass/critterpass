/**
 * Public previews (docs/api-contracts.md §5.6 `GET /v1/public/{kind}/{token}`): what the web shows
 * a stranger holding a link, read through the `public_reader` views and nothing else.
 */
import { z } from 'zod';

/** How many draft days the invite ticket lists. */
export const PUBLIC_PROPOSAL_DAYS = 3;

export const publicProposalDaySchema = z.object({
  day_no: z.number().int().positive(),
  /** Local calendar day (`YYYY-MM-DD`), null while the trip has no dates. */
  date: z.string().nullable(),
  theme: z.string().nullable(),
  /** Up to three stop names in the day's order. */
  stops: z.array(z.string()).max(3),
});
export type PublicProposalDay = z.infer<typeof publicProposalDaySchema>;

/**
 * The proposal behind a trip invite: its first days and how many there are. Never prices per
 * member, notes, attendees, bookings or who anyone is.
 */
export const publicProposalSchema = z.object({
  kind: z.literal('proposal'),
  days_total: z.number().int().nonnegative(),
  days: z.array(publicProposalDaySchema).max(PUBLIC_PROPOSAL_DAYS),
});
export type PublicProposal = z.infer<typeof publicProposalSchema>;

export const PUBLIC_PREVIEW_KINDS = ['proposal'] as const;
export type PublicPreviewKind = (typeof PUBLIC_PREVIEW_KINDS)[number];
