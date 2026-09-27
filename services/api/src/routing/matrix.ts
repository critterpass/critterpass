/**
 * Matrices up to 50x50 on the Mapbox Matrix API, which caps each request at 25 coordinates (10 on
 * `driving-traffic`) and 60 requests/minute (30 on `driving-traffic`). Larger matrices are split
 * into source x destination blocks that fit the cap, run with bounded concurrency, and stitched
 * back together. Billing is per element (origin-destination pair), so chunking never changes the
 * cost: a full 50x50 is 2,500 elements whatever the split (./README.md "Matrix").
 */
import type { TravelMode } from '@cp/domain';

import type { LngLat, MapboxRoutingClient } from './mapbox';
import { mapboxMatrixProfileFor } from './modes';
import type { LatLngPoint } from './provider';

export const MATRIX_COORDINATE_LIMIT = 25;
export const MATRIX_TRAFFIC_COORDINATE_LIMIT = 10;
/** Keeps one 50x50 (20 requests) well inside the 60 requests/minute limit's burst. */
const MATRIX_CONCURRENCY = 4;

export interface MatrixBlock {
  readonly sourceStart: number;
  readonly sourceCount: number;
  readonly destStart: number;
  readonly destCount: number;
}

/**
 * Splits an `origins x destinations` matrix into blocks whose coordinate count
 * (`sourceCount + destCount`) fits `coordinateLimit`, picking the split with the fewest requests.
 */
export function planMatrixBlocks(
  originCount: number,
  destCount: number,
  coordinateLimit: number,
): MatrixBlock[] {
  const split = (size: number) => {
    const sourceSize = Math.min(size, originCount);
    const destSize = Math.min(coordinateLimit - sourceSize, destCount);
    const requests = Math.ceil(originCount / sourceSize) * Math.ceil(destCount / destSize);
    return { sourceSize, destSize, requests };
  };
  let best = split(1);
  for (let size = 2; size < coordinateLimit; size++) {
    const candidate = split(size);
    if (candidate.requests < best.requests) best = candidate;
  }
  const { sourceSize, destSize } = best;
  const blocks: MatrixBlock[] = [];
  for (let sourceStart = 0; sourceStart < originCount; sourceStart += sourceSize) {
    for (let destStart = 0; destStart < destCount; destStart += destSize) {
      blocks.push({
        sourceStart,
        sourceCount: Math.min(sourceSize, originCount - sourceStart),
        destStart,
        destCount: Math.min(destSize, destCount - destStart),
      });
    }
  }
  return blocks;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface MapboxMatrixOutput {
  readonly durationsS: (number | null)[][];
  readonly distancesM: (number | null)[][];
  readonly traffic: boolean;
  readonly requests: number;
}

function placeBlock(
  target: (number | null)[][],
  block: MatrixBlock,
  values: readonly (readonly (number | null)[])[],
): void {
  values.forEach((row, i) => {
    const targetRow = target[block.sourceStart + i];
    if (targetRow === undefined) return;
    row.forEach((value, j) => {
      targetRow[block.destStart + j] = value;
    });
  });
}

const toLngLat = (point: LatLngPoint): LngLat => ({ lng: point.lng, lat: point.lat });

/** Runs a full matrix on Mapbox; throws the client's errors so the caller can fall back. */
export async function runMapboxMatrix(
  client: MapboxRoutingClient,
  origins: readonly LatLngPoint[],
  destinations: readonly LatLngPoint[],
  mode: TravelMode,
  departAt?: Date,
): Promise<MapboxMatrixOutput | undefined> {
  const profile = mapboxMatrixProfileFor(
    mode,
    origins.length + destinations.length,
    MATRIX_TRAFFIC_COORDINATE_LIMIT,
  );
  if (profile === undefined) return undefined;
  const limit =
    profile === 'driving-traffic' ? MATRIX_TRAFFIC_COORDINATE_LIMIT : MATRIX_COORDINATE_LIMIT;
  const blocks = planMatrixBlocks(origins.length, destinations.length, limit);
  const durationsS = origins.map(() => destinations.map((): number | null => null));
  const distancesM = origins.map(() => destinations.map((): number | null => null));
  // Only driving profiles accept depart_at on the Matrix API.
  const timed = departAt !== undefined && profile.startsWith('driving') ? { departAt } : {};

  await mapWithConcurrency(blocks, MATRIX_CONCURRENCY, async (block) => {
    const sources = origins.slice(block.sourceStart, block.sourceStart + block.sourceCount);
    const dests = destinations.slice(block.destStart, block.destStart + block.destCount);
    const response = await client.matrix({
      profile,
      coordinates: [...sources, ...dests].map(toLngLat),
      sources: sources.map((_, index) => index),
      destinations: dests.map((_, index) => sources.length + index),
      ...timed,
    });
    placeBlock(durationsS, block, response.durationsS);
    placeBlock(distancesM, block, response.distancesM);
  });

  return {
    durationsS,
    distancesM,
    traffic: profile === 'driving-traffic',
    requests: blocks.length,
  };
}
