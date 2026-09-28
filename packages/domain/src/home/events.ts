/**
 * Home, inbox, nudge and tip domain events (docs/api-contracts.md §4.3), plus the inputs the
 * countdown target is recomputed on (trip dates and destination, flight bookings, the user's zone).
 * Payloads carry ids and enum values only: never a nudge's text, a tip's line or a price.
 */
import { z } from 'zod';

export const HOME_EVENT_TYPES = [
  'inbox.item_resolved',
  'inbox.read',
  'nudge.sent',
  'nudge.received',
  'tip.created',
  'tip.dismissed',
  'trip.dates_changed',
  'trip.destination_set',
  'booking.flight_added',
  'booking.flight_changed',
  'booking.flight_removed',
  'user.tz_changed',
] as const;
export type HomeEventType = (typeof HOME_EVENT_TYPES)[number];

export const NUDGE_REASONS = ['vote', 'rsvp', 'readiness', 'payment', 'invite_open'] as const;
export const nudgeReasonSchema = z.enum(NUDGE_REASONS);
export type NudgeReason = z.infer<typeof nudgeReasonSchema>;

export const TIP_KINDS = ['fare_drop', 'book_by', 'season_peak', 'crowd_dip'] as const;
export const tipKindSchema = z.enum(TIP_KINDS);
export type TipKind = z.infer<typeof tipKindSchema>;

const nudgeRef = z.object({
  nudge_id: z.uuid(),
  sender_id: z.uuid(),
  target_id: z.uuid(),
  crew_id: z.uuid(),
  reason: nudgeReasonSchema,
});
const tripRef = z.object({ trip_id: z.uuid() });
const flightRef = z.object({
  trip_id: z.uuid(),
  booking_id: z.uuid(),
  /** Travellers on the booking; their countdowns move. */
  user_ids: z.array(z.uuid()),
});

export const HOME_EVENT_PAYLOADS = {
  // Aggregate is the inbox item; `via` names the action that settled it.
  'inbox.item_resolved': z.object({
    item_id: z.uuid(),
    user_id: z.uuid(),
    kind: z.string().max(60),
    action: z.string().max(40),
  }),
  // Aggregate is the user; how many rows one mark-read touched.
  'inbox.read': z.object({ user_id: z.uuid(), count: z.number().int().nonnegative() }),
  'nudge.sent': nudgeRef.extend({ channel: z.enum(['push', 'inbox', 'share_sheet']) }),
  'nudge.received': nudgeRef,
  'tip.created': z.object({ tip_id: z.uuid(), crew_id: z.uuid(), kind: tipKindSchema }),
  'tip.dismissed': z.object({ tip_id: z.uuid(), crew_id: z.uuid(), user_id: z.uuid() }),
  'trip.dates_changed': tripRef,
  'trip.destination_set': tripRef.extend({ destination_id: z.uuid() }),
  'booking.flight_added': flightRef,
  'booking.flight_changed': flightRef,
  'booking.flight_removed': flightRef,
  'user.tz_changed': z.object({ user_id: z.uuid(), tz: z.string().max(64) }),
} as const satisfies Record<HomeEventType, z.ZodType>;
