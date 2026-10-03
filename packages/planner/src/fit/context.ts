/**
 * What the fit engine reads: the crew's days (timed items with who goes and what is locked, the
 * night's stay, the chance of rain by hour, the month's crowd factor), the participants, and a
 * synchronous travel lookup. The server assembles it from the database and the planning travel
 * provider; the phone assembles the same shape from synced rows, so both give the same answer.
 *
 * Travel is injected: stored legs and the planning router when the server has them, straight-line
 * "about" minutes (× the destination's drive factor) otherwise, marked approx either way.
 */
import { estimateStraightLineEta, type CROWD_READ_SOURCES, type Hours } from '@cp/domain';

export type CrowdSource = (typeof CROWD_READ_SOURCES)[number];

export interface FitPoint {
  readonly lat: number;
  readonly lng: number;
}

/** A travel end: `stay`, a plan item's stable id, or a place id. */
export interface FitStop extends FitPoint {
  readonly key: string;
}

export interface FitLeg {
  readonly minutes: number;
  readonly mode: 'walk' | 'drive';
  /** A straight-line estimate: copy says "about". */
  readonly approx: boolean;
}

/** Minutes from one stop to another; `null` = unknown (not checked). */
export type FitTravel = (from: FitStop, to: FitStop) => FitLeg | null;

export interface FitItem {
  readonly stableId: string;
  readonly poiId: string | null;
  readonly category: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Who goes; empty = the whole crew. */
  readonly attendeeIds: readonly string[];
  /** Booked or locked: never moved, never overlapped. */
  readonly locked: boolean;
  readonly outdoor: boolean;
  readonly point: FitPoint | null;
}

export type WeatherSource = 'forecast' | 'normals';

export interface FitRain {
  /** Chance of rain for each local hour of the day, 0-100. */
  readonly hourly: readonly number[];
  readonly source: WeatherSource;
}

export type FitDayKind = 'arrival' | 'departure' | 'full';

export interface FitDay {
  readonly dayId: string;
  readonly dayNo: number;
  /** Local date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly kind: FitDayKind;
  /** Local minutes the crew can plan between (07:00-22:00; travel days narrow it). */
  readonly fromMin: number;
  readonly toMin: number;
  readonly items: readonly FitItem[];
  /** Where the crew sleeps that night; null = no anchor yet. */
  readonly stay: FitPoint | null;
  readonly rain: FitRain | null;
  /** The month's crowd factor (1 = an average month). */
  readonly crowdFactor: number;
}

export interface MealWindow {
  readonly fromMin: number;
  readonly toMin: number;
}

export interface MealWindows {
  readonly breakfast: MealWindow;
  readonly lunch: MealWindow;
  readonly dinner: MealWindow;
}

/** The global fallback; destinations that dine late carry their own. */
export const DEFAULT_MEAL_WINDOWS: MealWindows = {
  breakfast: { fromMin: 7 * 60, toMin: 10 * 60 },
  lunch: { fromMin: 11 * 60 + 30, toMin: 14 * 60 + 30 },
  dinner: { fromMin: 18 * 60 + 30, toMin: 22 * 60 },
};

export interface FitThresholds {
  /** Slack under this between a visit and the stops around it makes it tight. */
  readonly slackMin: number;
  /** A detour over this is a trade-off. */
  readonly detourMin: number;
  readonly rainPct: number;
  readonly normalRainPct: number;
  readonly busyLevel: number;
  readonly walkMaxM: number;
}

export const DEFAULT_FIT_THRESHOLDS: FitThresholds = {
  slackMin: 15,
  detourMin: 10,
  rainPct: 50,
  normalRainPct: 40,
  busyLevel: 70,
  walkMaxM: 1200,
};

export interface FitContext {
  /** The trip's zone: day dates and slots are local to it. */
  readonly tz: string;
  readonly participants: readonly string[];
  readonly days: readonly FitDay[];
  readonly driveFactor: number;
  readonly travel?: FitTravel;
  readonly meals?: MealWindows;
  readonly thresholds?: Partial<FitThresholds>;
}

export interface FitCrowds {
  readonly source: CrowdSource;
  /** A typical week: index 0 = Sunday, each 24 hourly levels 0-100; null = no curve that day. */
  readonly week: readonly (readonly number[] | null)[];
}

export interface FitPlace {
  readonly poiId: string | null;
  readonly point: FitPoint;
  readonly category: string;
  /** Our own `pois.hours`; null = unknown (the usual hours of its kind, labelled). */
  readonly hours: Hours | null;
  readonly timeNeededMin?: number | null;
  readonly outdoor: boolean;
  readonly crowds?: FitCrowds | null;
  readonly stances?: { readonly want: number; readonly ratherNot: number } | null;
  /** The place has an editorial best-time line (shown verbatim by the app). */
  readonly bestTime?: boolean;
  /** Its own item when the place is already in the plan: never counted as busy. */
  readonly stableId?: string | null;
}

const OUTDOOR_CATEGORIES: ReadonlySet<string> = new Set([
  'nature',
  'beach',
  'temple_shrine',
  'market',
]);

export function isOutdoorCategory(category: string): boolean {
  return OUTDOOR_CATEGORIES.has(category);
}

/** Straight-line minutes: walk when the leg is short, else drive × the destination's factor. */
export function straightLineTravel(driveFactor: number, walkMaxM: number): FitTravel {
  return (from, to) => {
    const leg = { originLat: from.lat, originLng: from.lng, destLat: to.lat, destLng: to.lng };
    const walk = estimateStraightLineEta({ ...leg, mode: 'pedestrian' });
    if (walk.distanceM <= walkMaxM) return { minutes: walk.minutes, mode: 'walk', approx: true };
    const drive = estimateStraightLineEta({ ...leg, mode: 'auto' });
    return { minutes: Math.round(drive.minutes * driveFactor), mode: 'drive', approx: true };
  };
}

export function thresholdsOf(context: FitContext): FitThresholds {
  return { ...DEFAULT_FIT_THRESHOLDS, ...context.thresholds };
}

export function travelOf(context: FitContext): FitTravel {
  return context.travel ?? straightLineTravel(context.driveFactor, thresholdsOf(context).walkMaxM);
}

export const legKey = (from: string, to: string): string => `${from}>${to}`;

/**
 * Known minutes first (stored legs, routed insertions), either direction, then `fallback` (the
 * straight-line "about" minutes) for any pair nobody routed.
 */
export function layeredTravel(known: ReadonlyMap<string, FitLeg>, fallback: FitTravel): FitTravel {
  return (from, to) => {
    if (from.key === to.key) return { minutes: 0, mode: 'walk', approx: false };
    return (
      known.get(legKey(from.key, to.key)) ??
      known.get(legKey(to.key, from.key)) ??
      fallback(from, to)
    );
  };
}
