/**
 * Trip setup, rooms (docs/api-contracts.md §4.5): the stay the organiser picks, who sleeps where
 * (edited against the plan's version, so a concurrent edit is rejected and rebased rather than
 * lost), a member's own room chips, and their request to swap.
 */
import { z } from 'zod';

import { MAX_TRIP_STOPS } from '../planning/areas';

export const ROOM_CHIPS = [
  'early_bird',
  'night_owl',
  'light_sleeper',
  'snorer',
  'dont_care',
  'ground_floor',
] as const;
export const roomChipSchema = z.enum(ROOM_CHIPS);

/** How a member likes to sleep: share a room, a room of their own, or either way. */
export const ROOM_SLEEP_CHOICES = ['share', 'own', 'either'] as const;
export const roomSleepSchema = z.enum(ROOM_SLEEP_CHOICES);
export type RoomSleepChoice = z.infer<typeof roomSleepSchema>;

export const ROOM_TRAIT_LABELS = [
  'light_sleepers',
  'early_risers',
  'night_owls',
  'couple',
] as const;

/** Rooms a stay type is split into: doubles, and a single when the crew is odd. */
export const ROOM_DOUBLE_CAPACITY = 2;

/** The most stays one trip is split into: two a stop (a mix of stay types) on the longest route. */
export const MAX_TRIP_STAYS = MAX_TRIP_STOPS * 2;

const key = z.string().regex(/^[a-z0-9_-]{1,40}$/u, 'short key');

export const setStayChoicePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** A stay type of the destination's cost index (`ryokan`, `apartment`). */
  stay_option_id: key,
  /** A mix of stays (2 ryokan nights, then 5 apartment nights); default: the whole trip. */
  stays: z
    .array(z.strictObject({ stay_type: key, nights: z.int().min(1).max(30) }))
    .min(1)
    .max(MAX_TRIP_STAYS)
    .optional(),
});
export type SetStayChoicePayload = z.infer<typeof setStayChoicePayloadSchema>;

export const setRoomAssignmentPayloadSchema = z
  .strictObject({
    trip_id: z.uuid(),
    base_version: z.int().min(1),
    rooms: z
      .array(
        z.strictObject({
          stay_key: key,
          room_key: key,
          uids: z.array(z.uuid()).max(8),
        }),
      )
      .min(1)
      .max(40),
    /** Copy the pairs to the trip's other stays (the plan's default when absent). */
    same_pairs_all_stays: z.boolean().optional(),
  })
  .refine(
    (p) => {
      const seen = new Set<string>();
      return p.rooms.every((room) =>
        room.uids.every((uid) => {
          const id = `${room.stay_key}:${uid}`;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        }),
      );
    },
    { message: 'a member sleeps in one room per stay', path: ['rooms'] },
  );
export type SetRoomAssignmentPayload = z.infer<typeof setRoomAssignmentPayloadSchema>;

export const requestRoomSwapPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** The member they would like to share with or swap places with, when they have one in mind. */
  with_uid: z.uuid().optional(),
});
export type RequestRoomSwapPayload = z.infer<typeof requestRoomSwapPayloadSchema>;

export const setRoomPrefsPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  chips: z.array(roomChipSchema).max(ROOM_CHIPS.length),
  /** Who they share a bed with; `null` clears it. */
  partner_uid: z.uuid().nullable().optional(),
  /** How they like to sleep; `null` clears it, absent keeps it. */
  sleep: roomSleepSchema.nullable().optional(),
});
export type SetRoomPrefsPayload = z.infer<typeof setRoomPrefsPayloadSchema>;

export const lockRoomsPayloadSchema = z.strictObject({ trip_id: z.uuid() });
export type LockRoomsPayload = z.infer<typeof lockRoomsPayloadSchema>;

/** One room of a plan (`room_plans.rooms`), priced per room per night in the plan's currency. */
export interface PlanRoomWire {
  readonly stay_key: string;
  readonly stay_type: string;
  readonly stay_nights: number;
  readonly key: string;
  readonly capacity: number;
  readonly nightly_minor: number;
  readonly label: string;
}
