/**
 * The legs of a planned day: the night's stay to the first stop, each stop to the next in time
 * order, and the last stop back to the stay. Who goes to a stop doesn't change the order: the day
 * is read as one route. A day without a stay starts and ends at its stops; a day without stops has
 * no legs.
 */
import { STAY_LEG_KEY } from '@cp/domain';

export interface LegPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface DayStop extends LegPoint {
  /** The plan item's `stable_id`. */
  readonly key: string;
}

export interface PlannedDay {
  readonly dayId: string;
  readonly stay: LegPoint | null;
  /** In time order. */
  readonly stops: readonly DayStop[];
}

export interface LegPair {
  readonly dayId: string;
  readonly fromKey: string;
  readonly toKey: string;
  readonly from: LegPoint;
  readonly to: LegPoint;
}

export function dayPairs(day: PlannedDay): LegPair[] {
  const ends: DayStop[] =
    day.stay === null || day.stops.length === 0
      ? [...day.stops]
      : [{ key: STAY_LEG_KEY, ...day.stay }, ...day.stops, { key: STAY_LEG_KEY, ...day.stay }];
  const pairs: LegPair[] = [];
  for (let i = 1; i < ends.length; i += 1) {
    const from = ends[i - 1];
    const to = ends[i];
    if (from === undefined || to === undefined) continue;
    pairs.push({
      dayId: day.dayId,
      fromKey: from.key,
      toKey: to.key,
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
    });
  }
  return pairs;
}

/** Every day's pairs for one version; a repeated pair keeps its first day (one row per pair). */
export function versionPairs(days: readonly PlannedDay[]): LegPair[] {
  const seen = new Set<string>();
  return days.flatMap(dayPairs).filter((pair) => {
    const key = `${pair.fromKey}>${pair.toKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
