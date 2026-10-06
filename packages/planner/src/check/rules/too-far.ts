/**
 * Too far: a day whose driving adds up past the limit (three hours by default), or with one long
 * drive (an hour and a half) that arrives after dark. Its fix is a screen that works out the
 * alternative with the person.
 */
import type { FitStop } from '../../fit/context';
import type { CheckIssueDraft } from '../types';
import { travelFor, type CheckDay } from './shared';

const DARK_FROM = 18 * 60 + 30;

export function tooFarIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, input } = check;
  const travel = travelFor(check);
  const stops = model.items.filter((item) => item.point !== null);
  if (stops.length === 0) return [];
  const stay: FitStop | null = day.stay === null ? null : { key: 'stay', ...day.stay };
  const route: { stop: FitStop; start: number; end: number }[] = stops.map((item) => ({
    stop: { key: item.stableId, ...(item.point as { lat: number; lng: number }) },
    start: item.start,
    end: item.end,
  }));
  let drive = 0;
  let longest = 0;
  let afterDark = false;
  const darkFrom = input.darkFromMin ?? DARK_FROM;
  const legs: { from: FitStop; to: FitStop; departs: number }[] = [];
  const first = route[0];
  const last = route[route.length - 1];
  if (stay !== null && first !== undefined)
    legs.push({ from: stay, to: first.stop, departs: first.start });
  route.forEach((entry, index) => {
    const prev = route[index - 1];
    if (prev !== undefined) legs.push({ from: prev.stop, to: entry.stop, departs: prev.end });
  });
  if (stay !== null && last !== undefined)
    legs.push({ from: last.stop, to: stay, departs: last.end });
  for (const leg of legs) {
    // A day trip's way there and back is time, never driving.
    if (day.link != null && (leg.from.key === 'stay' || leg.to.key === 'stay')) continue;
    const minutes = travel(leg.from, leg.to);
    if (minutes === null || minutes.mode !== 'drive') continue;
    drive += minutes.minutes;
    longest = Math.max(longest, minutes.minutes);
    const arrives = leg.from.key === 'stay' ? leg.departs : leg.departs + minutes.minutes;
    if (minutes.minutes > input.thresholds.tooFarLegMin && arrives > darkFrom) afterDark = true;
  }
  if (drive <= input.thresholds.tooFarDayMin && !afterDark) return [];
  return [
    {
      kind: 'too_far',
      severity: 'fix',
      dayId: day.dayId,
      dayNo: day.dayNo,
      stableIds: [],
      params: {
        drive_minutes: drive,
        limit_minutes: input.thresholds.tooFarDayMin,
        longest_leg_minutes: longest,
        after_dark: afterDark,
      },
      fix: { kind: 'screen', screen: 'too_far' },
    },
  ];
}
