/** The words on a map card that are built from facts: the meta line, the plan chip, the distance. */
import { t } from '@lingui/core/macro';
import { toLocalWallTime } from '@cp/domain';
import { format } from '@cp/i18n';

import { categoryLabel } from './category';
import type { OpenState } from './place-model';

/** "Temple · open now". */
export function cardMeta(category: string, open: OpenState): string {
  const parts = [categoryLabel(category)];
  if (open === 'always') parts.push(t({ id: 'explore.place.open24', message: 'open 24h' }));
  else if (open === 'open') parts.push(t({ id: 'explore.place.openNow', message: 'open now' }));
  else if (open === 'closed') {
    parts.push(t({ id: 'explore.place.closedNow', message: 'closed now' }));
  }
  return parts.join(' · ');
}

/** "Day 2 · 06:00", the start in the trip's own zone; the day alone for an untimed item. */
export function planChip(dayNo: number, startsAt: string | null, tz: string | null): string {
  if (startsAt === null || tz === null) {
    return t({ id: 'explore.map.planDay', message: `Day ${dayNo}` });
  }
  const time = toLocalWallTime(new Date(startsAt), tz).time.slice(0, 5);
  return t({ id: 'explore.map.planDayTime', message: `Day ${dayNo} · ${time}` });
}

/** "You're 607 km away": whole kilometres, worded by the catalogue (no unit formatter). */
export function awayLine(locale: string, meters: number, place: string): string {
  const km = format.number(locale, Math.max(1, Math.round(meters / 1000)));
  return t({ id: 'explore.map.away', message: `You're ${km} km from ${place}` });
}
