/**
 * Feasibility vocabulary: the inputs a draft, an edit or a must-do is checked against, and the
 * violation codes every surface (drafts, change review, must-do fit, the guide's `fit_check`)
 * reports. The travel matrix is injected (precomputed per draft), so checks stay pure and fast.
 */
import { type Hours } from '@cp/domain';

export const VIOLATION_CODES = [
  'CLOSED_AT_TIME',
  'TRAVEL_TOO_LONG',
  'OVERLAP',
  'CHRONOTYPE',
  'MUST_DO_MISSING',
  'BOOKING_MOVED',
  'OFF_GRID',
] as const;
export type ViolationCode = (typeof VIOLATION_CODES)[number];

export const FIT_STATUSES = ['fits', 'tight', 'clash', 'unknown'] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];

export interface FeasibilityItem {
  readonly stableId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** IANA zone the item happens in (the POI's, else the destination's). */
  readonly tz: string;
  readonly dayNo?: number;
  /** Opening hours of the item's place; absent = no hours constraint. */
  readonly hours?: Hours | null;
  /** Who goes; absent or empty = the whole crew. */
  readonly attendeeIds?: readonly string[];
  readonly bookingId?: string | null;
  readonly mustDoId?: string | null;
}

/** Minutes to get from one item's place to the next one's; `null` = unknown (not checked). */
export type TravelMinutes = (fromStableId: string, toStableId: string) => number | null;

export type ChronotypeKind = 'early_bird' | 'night_owl';

export interface ChronotypeWindows {
  /** Early birds should be done by this local minute of the day (22:00). */
  readonly earlyBirdEndMin: number;
  /** Night owls should not start before this local minute of the day (09:00). */
  readonly nightOwlStartMin: number;
}

export const DEFAULT_CHRONOTYPE_WINDOWS: ChronotypeWindows = {
  earlyBirdEndMin: 22 * 60,
  nightOwlStartMin: 9 * 60,
};

export interface FixedBooking {
  readonly bookingId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface MustDoRef {
  readonly id: string;
  readonly ownerId: string;
}

export interface FeasibilityInput {
  readonly items: readonly FeasibilityItem[];
  readonly members: readonly string[];
  readonly travel: TravelMinutes;
  readonly chronotypes?: Readonly<Record<string, ChronotypeKind>>;
  readonly windows?: ChronotypeWindows;
  readonly mustDos?: readonly MustDoRef[];
  readonly bookings?: readonly FixedBooking[];
  /** Plan grid in minutes (15). */
  readonly gridMin?: number;
  /** Slack under this many minutes between items makes the plan `tight` (15). */
  readonly tightSlackMin?: number;
}

export interface Violation {
  readonly code: ViolationCode;
  /** The item the violation is on; `null` for a must-do with no item at all. */
  readonly stableId: string | null;
  /** The other item of an overlap or a travel leg. */
  readonly relatedId?: string;
  readonly mustDoId?: string;
  readonly uids?: readonly string[];
  /** Minutes short (travel) or overlapping (overlap). */
  readonly minutes?: number;
}
