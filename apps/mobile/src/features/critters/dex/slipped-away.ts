/**
 * "This one slipped away": a find the server could not confirm (a simulated location, an
 * impossible hop, a dwell that never really happened) is revoked and its pending entry removed.
 * The PASS tab says so once, from the synced encounter row, until the traveller dismisses it on
 * this phone; a revoke older than a week is no longer news.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and storage keys, never copy. */
import type { Rarity } from '@cp/domain';
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

export const SLIPPED_SQL = `SELECT e.id, e.verified_at, e.resolved_at, p.name AS place,
    f.rarity
  FROM encounters e LEFT JOIN pois p ON p.id = e.poi_id
  LEFT JOIN critter_forms f ON f.id = e.form_id
  WHERE e.user_id = ? AND e.verification = 'revoked'
  ORDER BY coalesce(e.verified_at, e.resolved_at) DESC LIMIT 5`;
export const SLIPPED_TABLES = ['encounters', 'pois', 'critter_forms'];

export interface SlippedRow {
  readonly id: string;
  readonly verified_at: string | null;
  readonly resolved_at: string | null;
  readonly place: string | null;
  readonly rarity?: Rarity | null;
}

export interface SlippedAway {
  readonly encounterId: string;
  readonly place: string | null;
  /** The form's tier: which find it was, without a name the traveller never got. */
  readonly rarity: Rarity | null;
}

const NEWS_MS = 7 * 24 * 3600 * 1000;

/** The latest revoked find still worth telling, or null. */
export function slippedAwayFor(
  rows: readonly SlippedRow[],
  now: Date,
  dismissed: (encounterId: string) => boolean,
): SlippedAway | null {
  for (const row of rows) {
    const at = Date.parse(row.verified_at ?? row.resolved_at ?? '');
    if (Number.isNaN(at) || now.getTime() - at > NEWS_MS) continue;
    if (dismissed(row.id)) continue;
    return { encounterId: row.id, place: row.place, rarity: row.rarity ?? null };
  }
  return null;
}

let storage: {
  getBoolean(key: string): boolean | undefined;
  set(k: string, v: boolean): void;
} | null = null;
const listeners = new Set<() => void>();
let version = 0;

function dismissedStorage() {
  storage ??= createMMKV({ id: 'cp-critters-slipped' });
  return storage;
}

export function slippedDismissed(encounterId: string): boolean {
  return dismissedStorage().getBoolean(encounterId) ?? false;
}

export function dismissSlipped(encounterId: string): void {
  dismissedStorage().set(encounterId, true);
  version += 1;
  for (const listener of listeners) listener();
}

/** Re-renders when a slipped-away note is dismissed on this phone. */
export function useSlippedVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}
