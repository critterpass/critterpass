/**
 * Unread messages in one crew: crewmates' and the guide's messages numbered past the member's
 * read marker (`crew_members.last_read_seq`). Both sides are server sequence numbers, so a device
 * with a wrong clock counts the same. `useMarkRead` moves the marker forward once the member has
 * sat at the bottom for a second, and never sends a lower one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import { markReadCommand } from './chat-commands';
import { useMyUid } from './use-my-uid';
import { quoted } from './rows';

export const MARK_READ_DEBOUNCE_MS = 1000;

const TABLES = ['messages', 'crew_members'];

function unreadSql(crewId: string, me: string): string {
  const crew = quoted(crewId);
  const uid = quoted(me);
  return `SELECT count(*) AS n FROM messages m
           WHERE m.crew_id = ${crew} AND m.sender_kind <> 'system'
             AND m.deleted_at IS NULL AND (m.sender_id IS NULL OR m.sender_id <> ${uid})
             AND m.seq > coalesce((SELECT last_read_seq FROM crew_members
                                    WHERE crew_id = ${crew} AND user_id = ${uid}), 0)`;
}

export async function unreadCount(
  db: AbstractPowerSyncDatabase,
  crewId: string,
  me: string,
): Promise<number> {
  const row = await db.getOptional<{ n: number }>(unreadSql(crewId, me));
  return Number(row?.n ?? 0);
}

/** Unread count for Home's crew pill and the crews sheet badge. */
export function useUnreadCount(crewId: string, uid?: string | null): number {
  const { db } = useLocalFirst();
  const owner = useMyUid();
  const me = uid === undefined ? owner : uid;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (me === null) return undefined;
    return watchRows<{ n: number }>(db, unreadSql(crewId, me), TABLES, (rows) =>
      setCount(Number(rows[0]?.n ?? 0)),
    );
  }, [db, crewId, me]);
  return count;
}

/** The member's stored read marker (0 before any read). */
export function useReadMarker(crewId: string, me: string | null): number {
  const { db } = useLocalFirst();
  const [marker, setMarker] = useState(0);
  useEffect(() => {
    if (me === null) return undefined;
    return watchRows<{ seq: number | null }>(
      db,
      `SELECT last_read_seq AS seq FROM crew_members
        WHERE crew_id = ${quoted(crewId)} AND user_id = ${quoted(me)}`,
      ['crew_members'],
      (rows) => setMarker(Number(rows[0]?.seq ?? 0)),
    );
  }, [db, crewId, me]);
  return marker;
}

/**
 * `markSeen(seq)` after the member reaches the bottom: debounced, and only ever forward of both
 * the stored marker and anything this screen already sent.
 */
export function useMarkRead(crewId: string, storedMarker: number) {
  const { commands } = useLocalFirst();
  const sent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(
    (seq: number) => {
      if (seq <= Math.max(storedMarker, sent.current)) return;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (seq <= Math.max(storedMarker, sent.current)) return;
        sent.current = seq;
        void commands.send(markReadCommand, { crew_id: crewId, seq });
      }, MARK_READ_DEBOUNCE_MS);
    },
    [commands, crewId, storedMarker],
  );
}
