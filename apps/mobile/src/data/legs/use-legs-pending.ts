/**
 * Whether a plan version's legs are still on their way. A new version (a delivered draft, a kept
 * redraft, an edit) gets the legs of its new pairs from the router a few seconds after it is made;
 * until then a screen should say it is working the rides out instead of printing an "about" figure
 * that changes under the reader's eyes. The wait ends by itself: a version counts as new for
 * `YOUNG_MS` after the server made it, and never for longer than `HARD_STOP_MS` after this phone
 * first saw it, so a phone whose clock runs behind the server's cannot sit on the waiting state.
 * A phone whose clock runs ahead simply never waits. After the wait a pair with no stored leg reads
 * as today's estimate, marked "about".
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useSyncExternalStore } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

/** How long after the server made a version its legs may still be coming. */
export const YOUNG_MS = 90_000;
/** The longest this phone waits for a version's legs, from when it first saw the version. */
export const HARD_STOP_MS = 45_000;

const VERSION_SQL = `SELECT created_at FROM itinerary_versions WHERE id = ?`;
const VERSION_TABLES = ['itinerary_versions'];

/** Each version seen here: when (on this phone's clock), and whether its wait is over. */
const seenVersions = new Map<string, { readonly seen: number; readonly over: boolean }>();
const listeners = new Set<() => void>();

function note(versionId: string, entry: { readonly seen: number; readonly over: boolean }): void {
  seenVersions.set(versionId, entry);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The phone time until which the version's missing legs count as on their way; 0 when they do not
 * (the version is not known here, or is not new).
 */
export function pendingUntil(createdAt: string | null, firstSeenAt: number): number {
  const made = createdAt === null ? Number.NaN : Date.parse(createdAt);
  if (Number.isNaN(made)) return 0;
  return Math.min(made + YOUNG_MS, firstSeenAt + HARD_STOP_MS);
}

export function useLegsPending(versionId: string | null): boolean {
  const version = useLiveRows<{ created_at: string | null }>(
    VERSION_SQL,
    versionId === null ? null : [versionId],
    VERSION_TABLES,
  );
  const createdAt = version.rows[0]?.created_at ?? null;
  useEffect(() => {
    if (versionId === null || createdAt === null) return undefined;
    const seen = seenVersions.get(versionId)?.seen ?? Date.now();
    const left = pendingUntil(createdAt, seen) - Date.now();
    note(versionId, { seen, over: left <= 0 });
    if (left <= 0) return undefined;
    const timer = setTimeout(() => note(versionId, { seen, over: true }), left);
    return () => clearTimeout(timer);
  }, [createdAt, versionId]);
  const waiting = (): boolean => versionId !== null && seenVersions.get(versionId)?.over === false;
  return useSyncExternalStore(subscribe, waiting, waiting);
}
