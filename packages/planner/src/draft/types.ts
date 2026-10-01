/**
 * What the drafting pipeline hands the planner: the places the guide may choose from (our curated
 * POI table only, never supplier content), the trip's fixed frame (dates, zone, crew, chronotypes,
 * diets, budget, must-dos, cited closures) and an injected travel matrix. The guide's reply is only
 * `DayChoice`s: which places, in which order, with a line of prose; the planner turns them into
 * timed, priced items and checks them.
 */
import type { ClosureRecord, Hours } from '@cp/domain';

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
}

export interface DraftMustDo {
  readonly id: string;
  readonly ownerId: string;
  /** Null for a freeform must-do (no place to schedule). */
  readonly poiId: string | null;
  readonly title: string;
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
}

/** Minutes between two places; null = unknown (not checked). */
export type TravelMatrix = (fromPoiId: string, toPoiId: string) => number | null;

/** One stop the guide picked for a day, in the order it wants them. */
export interface DayChoice {
  readonly poiId: string;
  readonly kind: 'activity' | 'meal';
  readonly mustDoId: string | null;
  readonly note: string | null;
}

/** The destination's cost bands (`destination_cost_indices`) in the trip currency. */
export interface CostBands {
  readonly foodPpDayMinor: number;
  readonly funPpDayMinor: number;
}

export interface DayWindow {
  readonly startMin: number;
  readonly endMin: number;
}
