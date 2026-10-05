/**
 * The addresses of a search's places that this phone holds, by place id: a row's area ("Ubud")
 * is read from the address when the server did not send one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

const MAX_IDS = 80;

export function usePhoneAddresses(ids: readonly string[]): ReadonlyMap<string, string> {
  const wanted = useMemo(() => [...new Set(ids)].sort().slice(0, MAX_IDS), [ids]);
  const rows = useLiveRows<{ id: string; address: string | null }>(
    `SELECT id, address FROM pois WHERE id IN (${wanted.map(() => '?').join(',')})`,
    wanted.length === 0 ? null : wanted,
    ['pois'],
  ).rows;
  return useMemo(
    () =>
      new Map(
        rows.flatMap((row) => (row.address === null ? [] : [[row.id, row.address] as const])),
      ),
    [rows],
  );
}
