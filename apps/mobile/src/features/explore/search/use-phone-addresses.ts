/**
 * The addresses of a search's places that this phone knows, by place id: a row's area ("Ubud")
 * is read from the address when the server did not send one. The phone's synced rows answer first,
 * then the copies of places read through the api (`@/data/places/place-read`); nothing is asked of
 * the network here, since the search's own answer already carries what the server knows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { placeCache, placePath, placeWireSchema } from '@/data/places/place-read';
import { useLiveRows } from '@/data/plan/live-rows';
import type { LastGoodCache } from '@/data/travel-data/client';

const MAX_IDS = 80;

/** The phone's addresses, then those of the kept api copies for the ids it lacks. */
export function knownAddresses(
  ids: readonly string[],
  held: readonly { readonly id: string; readonly address: string | null }[],
  cache: LastGoodCache,
): ReadonlyMap<string, string> {
  const found = new Map(
    held.flatMap((row) => (row.address === null ? [] : [[row.id, row.address] as const])),
  );
  for (const id of ids) {
    if (found.has(id)) continue;
    const saved = cache.get(placePath(id));
    const parsed = saved === undefined ? undefined : placeWireSchema.safeParse(saved.body);
    if (parsed?.success === true && parsed.data.address !== null) {
      found.set(id, parsed.data.address);
    }
  }
  return found;
}

export function usePhoneAddresses(ids: readonly string[]): ReadonlyMap<string, string> {
  const wanted = useMemo(() => [...new Set(ids)].sort().slice(0, MAX_IDS), [ids]);
  const rows = useLiveRows<{ id: string; address: string | null }>(
    `SELECT id, address FROM pois WHERE id IN (${wanted.map(() => '?').join(',')})`,
    wanted.length === 0 ? null : wanted,
    ['pois'],
  ).rows;
  return useMemo(() => knownAddresses(wanted, rows, placeCache()), [wanted, rows]);
}
