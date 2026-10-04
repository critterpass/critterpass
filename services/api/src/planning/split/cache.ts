/**
 * The split's options are worked out once per (trip, place, stances, plan version, language) and
 * kept for an hour in Redis: a new stance or a new plan version is a new key, so nobody sees
 * options built for a crew that has since changed its mind or its plan.
 */
import { createHash } from 'node:crypto';

import type { StanceLine } from './stances';

export const SPLIT_CACHE_SECONDS = 60 * 60;

export interface SplitCacheClient {
  get(key: string): Promise<string | null | object>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export function stancesHash(lines: readonly StanceLine[]): string {
  const canonical = [...lines]
    .sort((a, b) => a.user_id.localeCompare(b.user_id))
    .map((line) => [line.user_id, line.stance, line.note ?? ''].join('\u0000'))
    .join('\u0001');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function splitCacheKey(input: {
  readonly tripId: string;
  readonly poiId: string;
  readonly stances: string;
  readonly versionId: string | null;
  readonly locale: string;
}): string {
  return [
    'planning:split:v1',
    input.tripId,
    input.poiId,
    input.stances,
    input.versionId ?? 'none',
    input.locale,
  ].join(':');
}

export async function readCached<T>(client: SplitCacheClient, key: string): Promise<T | null> {
  try {
    const hit = await client.get(key);
    return typeof hit === 'string' ? (JSON.parse(hit) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCached(
  client: SplitCacheClient,
  key: string,
  value: unknown,
): Promise<void> {
  try {
    await client.set(key, JSON.stringify(value), { EX: SPLIT_CACHE_SECONDS });
  } catch {
    // A cache that cannot be written only costs the next reader a rebuild.
  }
}
