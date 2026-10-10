/**
 * "Read by N" under your own messages: how many active crewmates have a read marker
 * (`crew_members.last_read_seq`, synced for the whole crew) at or past the message's `seq`. Both
 * sides are server sequence numbers, so device clocks never matter; a message still waiting for its
 * `seq` has no readers yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import { quoted } from './rows';

function markersSql(crewId: string, me: string): string {
  return `SELECT last_read_seq AS seq FROM crew_members
           WHERE crew_id = ${quoted(crewId)} AND status = 'active' AND user_id <> ${quoted(me)}`;
}

/** Crewmates' read markers, highest first. */
export async function loadReadMarkers(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  me: string,
): Promise<number[]> {
  const rows = await db.getAll<{ seq: number | null }>(markersSql(crewId, me));
  return toMarkers(rows);
}

function toMarkers(rows: readonly { seq: number | null }[]): number[] {
  return rows.map((row) => Number(row.seq ?? 0)).sort((a, b) => b - a);
}

/** How many of `markers` have read the message numbered `seq` (none before it is numbered). */
export function readByCount(markers: readonly number[], seq: number | null): number {
  if (seq === null) return 0;
  let count = 0;
  for (const marker of markers) {
    if (marker < seq) break;
    count += 1;
  }
  return count;
}

/** `readBy(seq)` for the open chat, live as crewmates read. */
export function useReadReceipts(crewId: string, me: string | null) {
  const { db } = useLocalFirst();
  const [markers, setMarkers] = useState<readonly number[]>([]);
  useEffect(() => {
    if (me === null) return undefined;
    return watchRows<{ seq: number | null }>(db, markersSql(crewId, me), ['crew_members'], (rows) =>
      setMarkers(toMarkers(rows)),
    );
  }, [db, crewId, me]);
  return useCallback((seq: number | null) => readByCount(markers, seq), [markers]);
}
