/**
 * Routing tile boxes: one per destination the planning legs need (live guides and every
 * destination with an active trip), read by the tile build from the api (`GET /v1/routing/boxes`,
 * services/api/src/routes/routing-boxes.ts). The stored box is the destination's own extent; the
 * build widens it by 30 km so day trips out of town (Ubud → Tanah Lot, Đà Nẵng → Hội An) stay on
 * the graph.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/** `[minLon, minLat, maxLon, maxLat]`, WGS84. */
export type Bbox = readonly [number, number, number, number];

const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, 'empty box')
  .refine(
    ([minLon, minLat, maxLon, maxLat]) =>
      minLon >= -180 && maxLon <= 180 && minLat >= -90 && maxLat <= 90,
    'outside WGS84',
  );

export const destinationBoxSchema = z.object({
  slug: z.string().min(1),
  /** Why it is built: a live destination, or one with a trip in planning, pre or in. */
  reason: z.enum(['live', 'active_trip']),
  bbox: bboxSchema,
});

export const boxesFileSchema = z.object({
  /** When the list was read from `destinations` (ISO date). */
  generatedAt: z.string(),
  boxes: z.array(destinationBoxSchema),
});

export type DestinationBox = z.infer<typeof destinationBoxSchema>;
export type BoxesFile = z.infer<typeof boxesFileSchema>;

export const BUFFER_KM = 30;
const KM_PER_DEGREE_LAT = 111.32;

export const BOXES_PATH = join(import.meta.dirname, '..', 'boxes.json');

/** The last committed box list: the content factory's places kind is now its only consumer. */
export function readBoxes(path: string = BOXES_PATH): BoxesFile {
  return readBoxesFile(path);
}

/** A box list saved as JSON (the workflow's pull-request dry run reads a fixed one). */
export function readBoxesFile(path: string): BoxesFile {
  return boxesFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** The boxes the api says the planning legs need now. */
export async function fetchBoxes(
  apiBaseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<BoxesFile> {
  const url = `${apiBaseUrl.replace(/\/+$/, '')}/v1/routing/boxes`;
  const response = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`routing boxes: the api answered ${String(response.status)}`);
  return boxesFileSchema.parse(await response.json());
}

/** Widens a box by `km` on every side (longitude degrees shrink with latitude). */
export function bufferBbox(bbox: Bbox, km: number = BUFFER_KM): Bbox {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const dLat = km / KM_PER_DEGREE_LAT;
  const widestLat = Math.min(89, Math.max(Math.abs(minLat), Math.abs(maxLat)));
  const dLon = km / (KM_PER_DEGREE_LAT * Math.cos((widestLat * Math.PI) / 180));
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return [
    round(Math.max(-180, minLon - dLon)),
    round(Math.max(-90, minLat - dLat)),
    round(Math.min(180, maxLon + dLon)),
    round(Math.min(90, maxLat + dLat)),
  ];
}

/**
 * The box's centre, then the points halfway from it to each corner, as `[lon, lat]`: inside the
 * destination rather than on the buffered edge, which is often sea.
 */
export function innerPoints(bbox: Bbox): [number, number][] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = (minLon + maxLon) / 2;
  const lat = (minLat + maxLat) / 2;
  const half = (corner: number, centre: number) => (corner + centre) / 2;
  return [
    [lon, lat],
    [half(minLon, lon), half(minLat, lat)],
    [half(maxLon, lon), half(minLat, lat)],
    [half(maxLon, lon), half(maxLat, lat)],
    [half(minLon, lon), half(maxLat, lat)],
  ];
}

/** `minLon,minLat,maxLon,maxLat` as `osmium extract --bbox` takes it. */
export function osmiumBbox(bbox: Bbox): string {
  return bbox.join(',');
}
