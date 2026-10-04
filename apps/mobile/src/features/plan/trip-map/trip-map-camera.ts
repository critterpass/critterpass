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
  const points: Coord[] = stay === null ? stops : [...stops, [stay.lng, stay.lat]];
  // One day frames its nearby stops; a far one (a day trip's first stop) is an edge pill.
  if (stops.length > 0) return day === null ? points : nearby(points);
  const saved = model.ideas.map((idea) => [idea.lng, idea.lat] as const);
  if (saved.length > 0) return saved;
  return model.center === null ? [] : [model.center];
}

/** Kilometres between two `[lng, lat]` points (equirectangular: plenty for framing). */
function km(a: Coord, b: Coord): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111.32;
}

/** Points far from where the day mostly is (over 3× the middle distance, and over 6 km) drop out. */
const FAR_KM = 6;

export function nearby(points: readonly Coord[]): Coord[] {
  if (points.length < 3) return [...points];
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  const centre: Coord = [median(points.map((p) => p[0])), median(points.map((p) => p[1]))];
  const distances = points.map((point) => km(point, centre));
  const typical = median(distances);
  const kept = points.filter((_, index) => {
    const d = distances[index] ?? 0;
    return d <= FAR_KM || d <= typical * 3;
  });
  return kept.length >= 2 ? kept : [...points];
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
