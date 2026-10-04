/**
 * What the drafting pipeline hands the planner: the places the guide may choose from (our curated
 * POI table only, never supplier content), the trip's fixed frame (dates, zone, crew, chronotypes,
 * diets, budget, must-dos, cited closures) and an injected travel matrix. The guide's reply is only
 * `DayChoice`s: which places, in which order, with a line of prose; the planner turns them into
 * timed, priced items and checks them.
 */
import type { ClosureRecord, DraftDay, DraftItem, Hours, LockedReason } from '@cp/domain';

import type { WishTime } from './wish-time';

export interface DraftPoi {
  readonly id: string;
  readonly name: string;
  /** `pois.category` (`temple_shrine`, `food`, ...). */
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  /** The place's own zone, else the destination's. */
  readonly tz: string;
  readonly hours: Hours | null;
  /** The hours are the usual ones of places of its kind, not the place's own (./open-data). */
  readonly hoursGuessed?: boolean;
  /** 0 (free) to 4 (splurge); null = unknown. */
  readonly priceLevel: number | null;
  readonly tags: readonly string[];
  /** Minutes a visit takes (editorial `time_needed_min`, else a per-category default). */
  readonly durationMin: number;
  /** Curated by our editors (synced to phones); open-data places stay server-side. */
  readonly editorial: boolean;
  readonly mustSee: boolean;
  /** How much the row says about the place (filled editorial fields, known hours); 0 = bare. */
  readonly detail?: number;
  /** What our editors wrote: why go, and the best time to (`editorial.why_go`, `best_time`). */
  readonly whyGo?: string | null;
  readonly bestTime?: string | null;
}

export interface DraftMustDo {
  readonly id: string;
  readonly ownerId: string;
  /** Null for a freeform must-do (no place to schedule). */
  readonly poiId: string | null;
  readonly title: string;
  /** When in the day it should happen: the member's own words, else the guide's answer. */
  readonly when?: WishTime | null;
}

export type Chronotype = 'early_bird' | 'night_owl';

export interface TripFrame {
  /** The destination's zone. */
  readonly tz: string;
  readonly currency: string;
  /** Every trip date, first to last (`YYYY-MM-DD`). */
  readonly dates: readonly string[];
  readonly members: readonly string[];
  readonly chronotypes: Readonly<Record<string, Chronotype>>;
  /** Diets every meal must suit (`vegetarian`, `halal`, ...), from the crew's consented flags. */
  readonly diets: readonly string[];
  /** Local minute the crew lands on the first day; null = unknown (the afternoon is assumed). */
  readonly arrivalMin: number | null;
  /** Local minute the crew's flight leaves on the last day; null = unknown (midday is assumed). */
  readonly departureMin: number | null;
  /** What the days' stops may cost per person: the locked target less flights and stay nights;
   * null = no locked target. */
  readonly budgetPpMinor: number | null;
  readonly mustDos: readonly DraftMustDo[];
  readonly closures: readonly ClosureRecord[];
  /** Days (1-based) the crew asked to start later: their window opens later (see `dayWindow`). */
  readonly laterStartDays?: readonly number[];
}

/** Minutes between two places; null = unknown (not checked). */
export type TravelMatrix = (fromPoiId: string, toPoiId: string) => number | null;

/** One stop the guide picked for a day, in the order it wants them. */
export interface DayChoice {
  readonly poiId: string;
  readonly kind: 'activity' | 'meal';
  readonly mustDoId: string | null;
  readonly note: string | null;
  /** A must-do held to its time of day (see ./wish-time). */
  readonly when?: WishTime | null;
  /** Why the stop may not be taken off the day (a booking, a stop the organiser placed by hand). */
  readonly lockedReason?: LockedReason | null;
}

/**
 * Whether a stop is the crew's own: a must-do, a booking, or one the organiser placed by hand.
 * The planner plans around such a stop: it never trims it, lets it give way or blames it; the
 * stop beside it is the one out of place.
 */
export function isKept(item: Pick<DraftItem, 'must_do_id' | 'locked_reason'>): boolean {
  return item.must_do_id !== null || item.locked_reason !== null;
}

/** A day's stops as choices, in their order, each keeping why it is locked. */
export function choicesOfDay(day: Pick<DraftDay, 'items'>): DayChoice[] {
  return day.items.map((item) => ({
    poiId: item.poi_id ?? '',
    kind: item.kind,
    mustDoId: item.must_do_id,
    note: item.note,
    lockedReason: item.locked_reason,
  }));
}

/** The destination's cost bands (`destination_cost_indices`) in the trip currency. */
export interface CostBands {
  readonly foodPpDayMinor: number;
  readonly funPpDayMinor: number;
}

export interface DayWindow {
  readonly startMin: number;
  readonly endMin: number;
  /**
   * The hard edges a must-do held to its time of day may use instead (landing and take-off on
   * the first and last day, else the small hours); the usual day otherwise.
   */
  readonly earliestMin?: number;
  readonly latestMin?: number;
}
