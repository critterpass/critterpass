/**
 * What the trip map's camera frames and labels: a day's stops with its stay (or every day's stops
 * for the whole trip; the saved places, then the destination's centre, while there are none), and
 * the picked stop's label ("Stop 3 · 14:00 · rain likely").
 */
import { t } from '@lingui/core/macro';

import type { Coord } from '@/ui/map/planning';

import { clock } from '../day/format';
import type { TripMapModel } from './sheet-props';
import { issueFor, type TripDay } from './trip-days';
import type { Picked, PickedStop } from './trip-map-layers';

export function viewPoints(
  model: Pick<TripMapModel, 'days' | 'ideas' | 'center'>,
  day: TripDay | null,
): Coord[] {
  const days = day === null ? model.days : [day];
  const stops = days.flatMap((entry) =>
    entry.stops.flatMap((stop) =>
      stop.place === null ? [] : [[stop.place.lng, stop.place.lat] as const],
    ),
  );
  const stay = day?.stay ?? null;
  if (stops.length > 0) return stay === null ? stops : [...stops, [stay.lng, stay.lat]];
  const saved = model.ideas.map((idea) => [idea.lng, idea.lat] as const);
  if (saved.length > 0) return saved;
  return model.center === null ? [] : [model.center];
}

export function pickedStopOf(
  picked: Picked,
  day: TripDay | null,
  locale: string,
): PickedStop | null {
  if (picked?.kind !== 'stop' || day === null) return null;
  const index = day.stops.findIndex((stop) => stop.stableId === picked.id);
  const stop = day.stops[index];
  if (stop?.place == null) return null;
  const n = index + 1;
  const parts = [t({ id: 'plan.tripMap.label.stop', message: `Stop ${n}` })];
  if (stop.start !== null) parts.push(clock(locale, stop.start));
  if (issueFor(day, stop.stableId)?.kind === 'rain') {
    parts.push(t({ id: 'plan.tripMap.label.rain', message: 'Rain likely' }));
  }
  return {
    lat: stop.place.lat,
    lng: stop.place.lng,
    title: stop.title,
    subtitle: parts.join(' · '),
    color: day.color,
  };
}
