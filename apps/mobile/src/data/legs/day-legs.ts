/**
 * The legs between a day's stops (7a-2 "CAR · 1H10", 7b-1, 7i-2): the stored leg for each pair
 * when the plan has one (worked out by the router and synced, so it reads offline), else an
 * "about" straight-line estimate, walking when the stops are close and driving otherwise.
 */
/* eslint-disable lingui/no-unlocalized-strings -- leg modes and sources, never copy. */
import { estimateStraightLineEta, STAY_LEG_KEY, type LegMode, type LegSource } from '@cp/domain';

/** The longest leg the plan suggests walking (`routing.walk_max_m`). */
export const WALK_MAX_M = 1200;

export interface LegEnd {
  /** `stay` for the night's stay, else the stop's stable id. */
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
}

export interface StoredLeg {
  readonly from_key: string;
  readonly to_key: string;
  readonly mode: string;
  readonly minutes: number;
  readonly meters: number;
  readonly source: string;
  readonly approx: number | boolean;
}

export interface DayLeg {
  readonly from: string;
  readonly to: string;
  readonly mode: LegMode;
  readonly minutes: number;
  readonly meters: number;
  readonly source: LegSource;
  /** Shown as "about": a straight-line estimate, or a router leg with no live traffic. */
  readonly approx: boolean;
}

const MODES: readonly LegMode[] = ['walk', 'drive', 'ride', 'driver'];
const SOURCES: readonly LegSource[] = ['valhalla', 'straight_line'];

function fromStored(leg: StoredLeg): DayLeg | null {
  const mode = MODES.find((candidate) => candidate === leg.mode);
  const source = SOURCES.find((candidate) => candidate === leg.source);
  if (mode === undefined || source === undefined) return null;
  return {
    from: leg.from_key,
    to: leg.to_key,
    mode,
    minutes: leg.minutes,
    meters: leg.meters,
    source,
    approx: leg.approx === true || leg.approx === 1,
  };
}

export function estimateLeg(from: LegEnd, to: LegEnd): DayLeg {
  const route = { originLat: from.lat, originLng: from.lng, destLat: to.lat, destLng: to.lng };
  const walk = estimateStraightLineEta({ ...route, mode: 'pedestrian' });
  const walking = walk.distanceM <= WALK_MAX_M;
  const eta = walking ? walk : estimateStraightLineEta({ ...route, mode: 'auto' });
  return {
    from: from.key,
    to: to.key,
    mode: walking ? 'walk' : 'drive',
    minutes: eta.minutes,
    meters: eta.distanceM,
    source: 'straight_line',
    approx: true,
  };
}

/** One leg per pair of consecutive ends, stored where the plan has it. */
export function dayLegs(ends: readonly LegEnd[], stored: readonly StoredLeg[]): DayLeg[] {
  const byPair = new Map(stored.map((leg) => [`${leg.from_key}>${leg.to_key}`, leg]));
  return ends.slice(1).map((to, index) => {
    const from = ends[index] ?? to;
    const leg = byPair.get(`${from.key}>${to.key}`);
    return (leg === undefined ? null : fromStored(leg)) ?? estimateLeg(from, to);
  });
}

export { STAY_LEG_KEY };
