/** A Kyoto day (Asia/Tokyo, UTC+9) for feasibility checks. Demo data only. */
import { type Hours } from '@cp/domain';

import { type FeasibilityItem, type TravelMinutes } from '../../src/feasibility/types';

export const TZ = 'Asia/Tokyo';
export const CREW = ['u-alex', 'u-maya', 'u-rin', 'u-winston'];

/** Local Kyoto wall time on a 2027-04 date → instant. */
export const at = (day: number, time: string) =>
  new Date(`2027-04-${String(day).padStart(2, '0')}T${time}:00+09:00`);

export const ALWAYS_OPEN: Hours = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '00:00', end: '24:00' }]]),
  ),
};
/** Closed on Mondays, 10:00–17:00 otherwise. */
export const MUSEUM_HOURS: Hours = {
  weekly: Object.fromEntries(
    ['tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '10:00', end: '17:00' }]]),
  ),
};
export const MARKET_HOURS: Hours = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '09:00', end: '18:00' }]]),
  ),
};

export function item(
  stableId: string,
  day: number,
  start: string,
  end: string,
  extra: Partial<FeasibilityItem> = {},
): FeasibilityItem {
  return {
    stableId,
    startsAt: at(day, start),
    endsAt: at(day, end),
    tz: TZ,
    dayNo: day - 1,
    ...extra,
  };
}

/** Travel minutes between item ids; unknown legs are not checked. */
export function matrix(legs: Record<string, number>): TravelMinutes {
  return (from, to) => legs[`${from}>${to}`] ?? null;
}

/** Tuesday Apr 6: sunrise at Fushimi Inari (a must-do), the market, the museum, dinner. */
export const GOOD_DAY: readonly FeasibilityItem[] = [
  item('inari', 6, '06:00', '08:00', { hours: ALWAYS_OPEN, mustDoId: 'md-inari' }),
  item('market', 6, '09:30', '11:00', { hours: MARKET_HOURS }),
  item('museum', 6, '13:00', '15:00', { hours: MUSEUM_HOURS }),
  item('dinner', 6, '19:00', '21:00', { bookingId: 'bk-dinner' }),
];

export const GOOD_TRAVEL = matrix({ 'inari>market': 30, 'market>museum': 40, 'museum>dinner': 25 });
