/**
 * Rain and crowds on the day: an outdoor item over likely rain (50 % on the forecast, 40 % on the
 * usual chance), and an item that starts in a busy window (level 70) when the place has a quiet
 * stretch long enough that day. Both are worked out on the rain and crowds screen.
 */
import { openSpans } from '@cp/domain';

import { usualHours } from '../../draft/open-data';
import { clockOf } from '../../fit/day-model';
import { crowdDay, quietExists } from '../../fit/reasons';
import type { CheckIssueDraft } from '../types';
import { itemOf, placeOf, type CheckDay } from './shared';

const hoursOf = (start: number, end: number) => {
  const hours: number[] = [];
  for (let hour = Math.floor(start / 60); hour * 60 < end && hour < 24; hour += 1) hours.push(hour);
  return hours;
};

export function rainIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, input } = check;
  const rain = day.rain;
  if (rain === null || rain.hourly.length !== 24) return [];
  const limit =
    rain.source === 'forecast' ? input.thresholds.rainPct : input.thresholds.normalRainPct;
  return model.items.flatMap((item) => {
    if (itemOf(day, item.stableId)?.outdoor !== true) return [];
    const wet = hoursOf(item.start, item.end).filter((hour) => (rain.hourly[hour] ?? 0) >= limit);
    const from = wet[0];
    const to = wet[wet.length - 1];
    if (from === undefined || to === undefined) return [];
    return [
      {
        kind: 'rain' as const,
        severity: 'fix' as const,
        dayId: day.dayId,
        dayNo: day.dayNo,
        stableIds: [item.stableId],
        params: {
          stable_id: item.stableId,
          from: clockOf(from * 60),
          to: clockOf(Math.min((to + 1) * 60, 1439)),
          pct: Math.max(...wet.map((hour) => rain.hourly[hour] ?? 0)),
          source: rain.source,
        },
        fix: { kind: 'screen' as const, screen: 'rain_crowds' as const },
      },
    ];
  });
}

export function crowdIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, input } = check;
  const busy = input.thresholds.busyLevel;
  return model.items.flatMap((item) => {
    const place = placeOf(check, item);
    if (!place?.crowds) return [];
    const crowd = crowdDay(place.crowds, day.date, day.crowdFactor);
    if (crowd === null) return [];
    const startHour = Math.floor(item.start / 60);
    const level = crowd.levels[startHour] ?? 0;
    if (level < busy) return [];
    const spans = openSpans(place.hours ?? usualHours('other'), day.date);
    if (!quietExists(crowd, spans, day, item.end - item.start, busy)) return [];
    let runStart = startHour;
    while (runStart > 0 && (crowd.levels[runStart - 1] ?? 0) >= busy) runStart -= 1;
    const quietBefore = crowd.levels
      .slice(0, runStart)
      .some((value, hour) => hour * 60 >= day.fromMin && value < busy);
    return [
      {
        kind: 'crowds' as const,
        severity: 'fix' as const,
        dayId: day.dayId,
        dayNo: day.dayNo,
        stableIds: [item.stableId],
        params: {
          stable_id: item.stableId,
          level,
          busy_from: clockOf(runStart * 60),
          quiet_until: quietBefore ? clockOf(runStart * 60) : null,
          source: crowd.source,
        },
        fix: { kind: 'screen' as const, screen: 'rain_crowds' as const },
      },
    ];
  });
}
