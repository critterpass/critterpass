/** What the draft validator reports (./validate-itinerary), in the order it lists them. */
export const DRAFT_VIOLATION_CODES = [
  'UNKNOWN_POI',
  'CLOSED_AT_TIME',
  'CLOSED_ON_DATE',
  'OVERLAP',
  'TRAVEL_TOO_LONG',
  'OFF_GRID',
  'DAY_OVERRUN',
  'FLIGHT_BUFFER',
  'WRONG_TIME_OF_DAY',
  'DIETARY',
  'DUPLICATE_PLACE',
  'EXTRA_MEAL',
  'MEAL_OFF_HOURS',
  'MEAL_MISSING',
  'REPEAT_DISH',
  'LONG_HOP',
  'CROWDED_LONG_VISIT',
  'OFF_THE_OUTING',
  'INSIDE_ANOTHER_STOP',
  'MUST_DO_MISSING',
  'OVER_BUDGET',
] as const;
export type DraftViolationCode = (typeof DRAFT_VIOLATION_CODES)[number];

export interface DraftViolation {
  readonly code: DraftViolationCode;
  /** Null for trip-wide violations (a must-do with no item, the budget). */
  readonly dayNo: number | null;
  readonly stableId: string | null;
  readonly poiId?: string;
  readonly mustDoId?: string;
  /** Minutes short or over (travel, overlap, a hop); per-person amount over (budget). */
  readonly amount?: number;
  /** The meal a day is missing (`MEAL_MISSING`). */
  readonly slot?: 'lunch' | 'dinner';
}
