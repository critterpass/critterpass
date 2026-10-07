/**
 * Recap and memory domain events. Payloads carry ids and enums only (`domain_events` is exported to
 * analytics and read crew-wide): no award words, no amounts, no signature strokes.
 */
import { z } from 'zod';

export const RECAP_EVENT_TYPES = [
  'recap.ready',
  'recap.signed',
  'recap.mvp_voted',
  'recap.mvp_closed',
  'recap.award_opted_out',
  'memory.surfaced',
  'memory.reacted',
  'recap_link.created',
  'recap_link.revoked',
] as const;
export type RecapEventType = (typeof RECAP_EVENT_TYPES)[number];

const recap = z.object({ trip_id: z.uuid(), recap_id: z.uuid() });

export const RECAP_EVENT_PAYLOADS = {
  /** First time the recap is ready (N-32 goes once, on this). */
  'recap.ready': recap.extend({ version: z.int().min(1) }),
  'recap.signed': recap.extend({ signer_id: z.uuid() }),
  'recap.mvp_voted': recap.extend({ voter_id: z.uuid(), award_id: z.uuid() }),
  'recap.mvp_closed': recap.extend({ award_ids: z.array(z.uuid()) }),
  'recap.award_opted_out': recap.extend({ award_id: z.uuid(), opted_out: z.boolean() }),
  /** A year-later memory reached one traveller, on their own clock (N-35 goes to them). */
  'memory.surfaced': z.object({ trip_id: z.uuid(), memory_id: z.uuid(), user_id: z.uuid() }),
  'memory.reacted': z.object({ trip_id: z.uuid(), memory_id: z.uuid(), user_id: z.uuid() }),
  /** A traveller made the recap's public link, or it was switched off (never the token). */
  'recap_link.created': recap.extend({ link_id: z.uuid() }),
  'recap_link.revoked': recap.extend({ link_id: z.uuid() }),
} as const;
