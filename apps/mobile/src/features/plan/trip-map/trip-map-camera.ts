/**
 * What the trip map's camera frames and labels: a day's stops with its stay (or every day's stops
 * for the whole trip; the saved places, then the destination's centre, while there are none), the
 * camera a map opens on before it can be moved (already on those points), when a fit has to be
 * asked for again, and the picked stop's label ("Stop 3 · 14:00 · rain likely").
 */
import { t } from '@lingui/core/macro';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import type { Coord, EdgeStop } from '@/ui/map/planning';

import { clock } from '../day/format';
import type { TripMapModel } from './sheet-props';
import { issueFor, type TripDay } from './trip-days';
import type { Picked, PickedStop } from './trip-map-layers';

export function viewPoints(
  model: Pick<TripMapModel, 'days' | 'ideas' | 'center'>,
  day: TripDay | null,
): Coord[] {
  // The whole trip frames the first stop's days: a day trip (or a later city) drawn with them
  // would show neither, and is reached by choosing its day.
  const days =
    day === null
      ? model.days.filter((entry) => entry.area === undefined && entry.laterStop === undefined)
      : [day];
  const stops = days.flatMap((entry) =>
    entry.stops.flatMap((stop) =>
      stop.place === null ? [] : [[stop.place.lng, stop.place.lat] as const],
    ),
  );
  const stay = day?.stay ?? null;
  const points: Coord[] = stay === null ? stops : [...stops, [stay.lng, stay.lat]];
  // A day frames every one of its stops: an edge pill is for after she pans, not the first view.
  if (stops.length > 0) return points;
  // An empty day trip frames its own area, never the saved places of the base city.
  if (day?.area !== undefined) return model.center === null ? [] : [model.center];
  const saved = model.ideas.map((idea) => [idea.lng, idea.lat] as const);
  if (saved.length > 0) return saved;
  return model.center === null ? [] : [model.center];
}

/**
 * What a day's camera depends on: its stops' places in order and its stay. A re-read of the same
 * plan keeps the signature; an added, moved or removed stop changes it, and the camera fits again.
 */
export function fitSignature(day: TripDay | null): string {
  if (day === null) return '';
  const at = (point: { readonly lat: number; readonly lng: number } | null) =>
    point === null ? '-' : `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  return [
    String(day.dayNo),
    at(day.stay),
    ...day.stops.map((stop) => `${stop.stableId}@${at(stop.place)}`),
  ].join('|');
}

export interface OpeningCamera {
  readonly center: readonly [number, number];
  readonly zoom: number;
}

const WORLD_PX = 512;
const MIN_ZOOM = 3;
const MAX_ZOOM = 15;
/** Room kept around the points, as the fit keeps. */
const EDGE_PX = 32;

function mercatorY(lat: number): number {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * The centre and zoom that already show `points` in the part of a `size` view nothing covers, so
 * the map opens on them even when its first fit is lost (the style not loaded yet). Null for no
 * points or a view with no room.
 */
export function openingCamera(
  points: readonly Coord[],
  size: { readonly width: number; readonly height: number },
  covered: { readonly top?: number; readonly bottom?: number } = {},
): OpeningCamera | null {
  const [first] = points;
  if (first === undefined) return null;
  const top = covered.top ?? 0;
  const bottom = covered.bottom ?? 0;
  const width = size.width - 2 * EDGE_PX;
  const height = size.height - top - bottom - 2 * EDGE_PX;
  if (width <= 0 || height <= 0) return null;
  let west = first[0];
  let east = first[0];
  let south = first[1];
  let north = first[1];
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const lngSpan = Math.max(east - west, 0.002);
  const ySpan = Math.max(mercatorY(north) - mercatorY(south), (0.002 * Math.PI) / 180);
  const zoomLng = Math.log2((width * 360) / (WORLD_PX * lngSpan));
  const zoomLat = Math.log2((height * 2 * Math.PI) / (WORLD_PX * ySpan));
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomLng, zoomLat)));
  const lat = (south + north) / 2;
  // The points sit in the middle of the uncovered part, which is above the view's middle when a
  // sheet covers its foot: the camera's centre is that far south of them.
  const downPx = (bottom - top) / 2;
  const degreesPerPx = 360 / (WORLD_PX * 2 ** zoom);
  const shift = downPx * degreesPerPx * Math.cos((lat * Math.PI) / 180);
  return { center: [(west + east) / 2, lat - shift], zoom };
}

/** True when every point lies inside the map's visible bounds (`[west, south, east, north]`). */
export function pointsInView(points: readonly Coord[], bounds: LngLatBounds): boolean {
  const [west, south, east, north] = bounds;
  return points.every(([lng, lat]) => lng >= west && lng <= east && lat >= south && lat <= north);
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

/** The day's placed stops as the map's edge pills name them (numbered as the day lists them). */
export function edgeStops(day: TripDay): EdgeStop[] {
  return day.stops.flatMap((stop, index) =>
    stop.place === null
      ? []
      : [{ id: stop.stableId, n: index + 1, name: stop.title, color: day.color, ...stop.place }],
  );
}
