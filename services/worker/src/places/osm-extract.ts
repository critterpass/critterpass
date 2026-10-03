/**
 * Finds and downloads the Geofabrik extract that covers a destination's bounds. Geofabrik publishes
 * an index of every extract with its boundary (download.geofabrik.de/index-v1.json); the smallest
 * extract that covers the bounds wins (`pickRegion`), so Bali reads the 176 MB Nusa Tenggara file
 * rather than all of Indonesia. Files land in the OS temp directory and only the last
 * one is kept, so a run over several destinations in one country downloads it once.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

import { z } from 'zod';

import type { BoundingBox } from './source-readers';

const INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const DOWNLOAD_DIR = path.join(tmpdir(), 'critterpass-osm');
const USER_AGENT = 'critterpass-places-ingest (https://critterpass.app)';

type Ring = readonly (readonly [number, number])[];
type Polygon = readonly Ring[];

const geometrySchema = z.union([
  z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
  }),
]);

const indexSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        id: z.string(),
        urls: z.object({ pbf: z.url().optional() }).optional(),
      }),
      geometry: geometrySchema.nullable(),
    }),
  ),
});

export interface GeofabrikRegion {
  readonly id: string;
  readonly pbfUrl: string;
  readonly polygons: readonly Polygon[];
  /** Area of the boundary's bounding box in square degrees: the "smallest extract" measure. */
  readonly extent: number;
}

/** Even-odd ray cast over every ring, so holes in a boundary count as outside. */
function ringContains(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as readonly [number, number];
    const [xj, yj] = ring[j] as readonly [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function regionContains(region: GeofabrikRegion, lng: number, lat: number): boolean {
  return region.polygons.some(
    (polygon) => polygon.filter((ring) => ringContains(ring, lng, lat)).length % 2 === 1,
  );
}

export function parseGeofabrikIndex(body: unknown): GeofabrikRegion[] {
  const regions: GeofabrikRegion[] = [];
  for (const feature of indexSchema.parse(body).features) {
    const pbfUrl = feature.properties.urls?.pbf;
    if (pbfUrl === undefined || feature.geometry === null) continue;
    const polygons: Polygon[] =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of polygons.flat(2)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    regions.push({
      id: feature.properties.id,
      pbfUrl,
      polygons,
      extent: (maxX - minX) * (maxY - minY),
    });
  }
  return regions;
}

const GRID = 5;
/** Share of the box's sample points an extract may miss (a corner out at sea) and still win. */
const COVERAGE_SLACK = 0.1;

/**
 * The extract for the bounds: among extracts holding the box's centre, the smallest one that
 * covers nearly as much of the box (the centres of a 5 x 5 grid) as the best-covering one. Box corners
 * often sit in the sea outside a regional boundary, so full containment would always pick the
 * whole country. Null when no extract holds the centre.
 */
export function pickRegion(
  regions: readonly GeofabrikRegion[],
  bbox: BoundingBox,
): GeofabrikRegion | null {
  const points: (readonly [number, number])[] = [];
  for (let x = 0; x < GRID; x += 1) {
    for (let y = 0; y < GRID; y += 1) {
      points.push([
        bbox.minLng + ((bbox.maxLng - bbox.minLng) * (x + 0.5)) / GRID,
        bbox.minLat + ((bbox.maxLat - bbox.minLat) * (y + 0.5)) / GRID,
      ]);
    }
  }
  const centre = [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2] as const;
  const candidates = regions
    .filter((region) => regionContains(region, centre[0], centre[1]))
    .map((region) => ({
      region,
      covered: points.filter(([lng, lat]) => regionContains(region, lng, lat)).length,
    }));
  const bestCover = Math.max(0, ...candidates.map((candidate) => candidate.covered));
  let best: GeofabrikRegion | null = null;
  for (const { region, covered } of candidates) {
    if (covered < bestCover * (1 - COVERAGE_SLACK)) continue;
    if (best === null || region.extent < best.extent) best = region;
  }
  return best;
}

let indexCache: Promise<GeofabrikRegion[]> | null = null;
let lastDownload: { readonly url: string; readonly file: string } | null = null;

async function loadIndex(fetcher: typeof fetch): Promise<GeofabrikRegion[]> {
  indexCache ??= (async () => {
    const response = await fetcher(INDEX_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`geofabrik index ${response.status}`);
    return parseGeofabrikIndex(await response.json());
  })().catch((error: unknown) => {
    indexCache = null;
    throw error;
  });
  return indexCache;
}

async function downloadExtract(region: GeofabrikRegion, fetcher: typeof fetch): Promise<string> {
  if (lastDownload?.url === region.pbfUrl) return lastDownload.file;
  await releaseOsmExtract();
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, `${region.id.replaceAll('/', '_')}.osm.pbf`);
  const response = await fetcher(region.pbfUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok || response.body === null) {
    throw new Error(`geofabrik download ${response.status} for ${region.id}`);
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      createWriteStream(file),
    );
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  lastDownload = { url: region.pbfUrl, file };
  return file;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `read` with the local path of the extract covering the bounds (null when no Geofabrik extract
 * covers them), downloading it unless it is the one already on disk. Runs one at a time, so a
 * second ingest never deletes the file the first is still reading.
 */
export function withOsmExtract<T>(
  bbox: BoundingBox,
  read: (file: string | null) => Promise<T>,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<T> {
  const run = queue.then(async () => {
    const region = pickRegion(await loadIndex(fetcher), bbox);
    return read(region === null ? null : await downloadExtract(region, fetcher));
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Deletes the extract kept on disk; call when a run is done. */
export async function releaseOsmExtract(): Promise<void> {
  if (lastDownload === null) return;
  const { file } = lastDownload;
  lastDownload = null;
  await rm(file, { force: true });
}
