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
        parent: z.string().optional(),
        urls: z.object({ pbf: z.url().optional() }).optional(),
      }),
      geometry: geometrySchema.nullable(),
    }),
  ),
});

export interface GeofabrikRegion {
  readonly id: string;
  /** A continent (or Russia): a top-level extract of tens of gigabytes. */
  readonly topLevel: boolean;
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
      topLevel: feature.properties.parent === undefined,
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
 * whole country. A top-level extract (a continent, tens of gigabytes) is never picked: a box across
 * a border (Strasbourg and Kehl) would otherwise pick all of Europe, so it takes its own side's
 * region and leaves the other bank to Overture and FSQ OS. Null when no other extract holds the
 * centre.
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
    .filter((region) => !region.topLevel && regionContains(region, centre[0], centre[1]))
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

/** Larger extracts are not fetched: the whole of France is 4.5 GB, more than a worker can scan in time. */
export const MAX_EXTRACT_BYTES = 3 * 1024 ** 3;
/** Longest an extract download may take; about a gigabyte a minute from the staging worker. */
export const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/** Hears which extract a read picked, and when it is on disk or was too large to fetch. */
export type OsmExtractListener = (event: {
  readonly step: 'picked' | 'downloaded' | 'too_large';
  readonly region: string;
  readonly bytes?: number;
}) => void;

/** The extract's local file, or null when it is larger than `MAX_EXTRACT_BYTES`. */
async function downloadExtract(
  region: GeofabrikRegion,
  fetcher: typeof fetch,
  listener: OsmExtractListener | undefined,
): Promise<string | null> {
  if (lastDownload?.url === region.pbfUrl) return lastDownload.file;
  await releaseOsmExtract();
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, `${region.id.replaceAll('/', '_')}.osm.pbf`);
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const response = await fetcher(region.pbfUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(`geofabrik download ${response.status} for ${region.id}`);
  }
  const bytes = Number(response.headers.get('content-length') ?? NaN);
  if (bytes > MAX_EXTRACT_BYTES) {
    await response.body.cancel();
    listener?.({ step: 'too_large', region: region.id, bytes });
    return null;
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      createWriteStream(file),
      { signal },
    );
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  lastDownload = { url: region.pbfUrl, file };
  listener?.({
    step: 'downloaded',
    region: region.id,
    ...(Number.isFinite(bytes) ? { bytes } : {}),
  });
  return file;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `read` with the local path of the extract covering the bounds (null when no Geofabrik extract
 * covers them or it is too large to fetch), downloading it unless it is the one already on disk.
 * Runs one at a time, so a second ingest never deletes the file the first is still reading; the
 * download's time limit keeps one stalled read from holding the ones behind it.
 */
export function withOsmExtract<T>(
  bbox: BoundingBox,
  read: (file: string | null) => Promise<T>,
  fetcher: typeof fetch = globalThis.fetch,
  listener?: OsmExtractListener,
): Promise<T> {
  const run = queue.then(async () => {
    const region = pickRegion(await loadIndex(fetcher), bbox);
    if (region === null) return read(null);
    listener?.({ step: 'picked', region: region.id });
    return read(await downloadExtract(region, fetcher, listener));
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
