/**
 * A curated destination's place box from its curated points: the researchers placed every line
 * where travellers go, so those points say where the destination is better than a locality that
 * merely shares its name (Ninh Bình's name also finds a village in Ninh Thuận).
 *
 * The box is centred on the points' median (a few day trips do not drag it), keeps the points
 * within `KEEP_FACTOR` times their median distance from that centre (at least `MIN_KEEP_KM`, at
 * most `MAX_KEEP_KM`, so a day trip 60 km out or a far waterfall stays out), spans those, padded
 * by `PAD_KM` and widened to `MIN_SIDE_KM`. The loader replaces the destination's box with it only
 * when the box it has holds fewer than `HOLD_SHARE` of the kept points: a right box stays as it is
 * and is never re-ingested for nothing.
 */
import { boxAround } from '../place-bounds';
import type { BoundingBox } from '../source-readers';

/** Fewer curated points than this say too little about the destination's area. */
export const MIN_POINTS = 5;
const KEEP_FACTOR = 3;
const MIN_KEEP_KM = 3;
const MAX_KEEP_KM = 30;
const PAD_KM = 1.5;
const MIN_SIDE_KM = 8;
/** The share of kept points the destination's box must hold to stay. */
export const HOLD_SHARE = 0.9;

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

const KM_PER_DEGREE_LAT = 111.32;
const kmPerDegreeLng = (lat: number) =>
  KM_PER_DEGREE_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180));

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371 * Math.asin(Math.sqrt(h));
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export interface CuratedBox {
  readonly box: BoundingBox;
  /** The points the box was drawn around (outliers left out). */
  readonly kept: readonly Point[];
}

/** The box around a destination's in-town curated points; null below `MIN_POINTS`. */
export function curatedBox(points: readonly Point[]): CuratedBox | null {
  if (points.length < MIN_POINTS) return null;
  const centre = { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
  const distances = points.map((point) => distanceKm(centre, point));
  const keep = Math.min(MAX_KEEP_KM, Math.max(MIN_KEEP_KM, KEEP_FACTOR * median(distances)));
  const kept = points.filter((_, index) => (distances[index] ?? Infinity) <= keep);
  const lats = kept.map((p) => p.lat);
  const lngs = kept.map((p) => p.lng);
  const padLat = PAD_KM / KM_PER_DEGREE_LAT;
  const padLng = PAD_KM / kmPerDegreeLng(centre.lat);
  let box: BoundingBox = {
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
    minLng: Math.min(...lngs) - padLng,
    maxLng: Math.max(...lngs) + padLng,
  };
  const least = boxAround(
    (box.minLat + box.maxLat) / 2,
    (box.minLng + box.maxLng) / 2,
    MIN_SIDE_KM,
  );
  box = {
    minLat: round(Math.min(box.minLat, least.minLat)),
    maxLat: round(Math.max(box.maxLat, least.maxLat)),
    minLng: round(Math.min(box.minLng, least.minLng)),
    maxLng: round(Math.max(box.maxLng, least.maxLng)),
  };
  return { box, kept };
}

const inside = (box: BoundingBox, point: Point) =>
  point.lat >= box.minLat &&
  point.lat <= box.maxLat &&
  point.lng >= box.minLng &&
  point.lng <= box.maxLng;

/** Whether `box` holds at least `HOLD_SHARE` of the points; no box holds nothing. */
export function boxHolds(box: BoundingBox | null, points: readonly Point[]): boolean {
  if (box === null || points.length === 0) return false;
  return points.filter((point) => inside(box, point)).length >= HOLD_SHARE * points.length;
}

/** A box as a short stable key, for keying the ingest of that box. */
export const boxKey = (box: BoundingBox | null): string =>
  box === null
    ? 'unbounded'
    : [box.minLng, box.minLat, box.maxLng, box.maxLat].map((v) => v.toFixed(3)).join(',');

/** The box drawn around the points when `current` holds too few of them; else null. */
export function redrawnBox(
  current: BoundingBox | null,
  points: readonly Point[],
): BoundingBox | null {
  const drawn = curatedBox(points);
  return drawn === null || boxHolds(current, drawn.kept) ? null : drawn.box;
}
