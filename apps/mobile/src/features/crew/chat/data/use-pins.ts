/**
 * Messages pinned to the trip ("Boat leaves at 8 sharp, gate 3"): the synced pins, newest first,
 * with this device's queued pin and unpin commands applied in queue order so a pin shows (or goes)
 * at once, offline too. Tombstoned messages drop out.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { PinMessagePayload } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import { pinMessageCommand } from './chat-commands';
import { quoted } from './rows';

export interface PinnedMessage {
  readonly id: string;
  readonly body: string;
  readonly type: string;
  readonly senderName: string | null;
  /** Null for a pin queued on this device that has not synced back yet. */
  readonly pinnedAt: string | null;
}

interface PinRow {
  readonly id: string;
  readonly body: string | null;
  readonly type: string;
  readonly sender_name: string | null;
  readonly pinned_at: string | null;
  readonly envelope: string | null;
}

const TABLES = ['messages', 'commands', 'users'];

/** Synced pins plus every message a queued pin command names, with that command's payload. */
function pinsSql(crewId: string): string {
  const crew = quoted(crewId);
  return `SELECT m.id, m.body, m.type, u.display_name AS sender_name, m.pinned_at, NULL AS envelope, 0 AS queued, 0 AS qseq
            FROM messages m LEFT JOIN users u ON u.id = m.sender_id
           WHERE m.crew_id = ${crew} AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL
          UNION ALL
          SELECT m.id, m.body, m.type, u.display_name, m.pinned_at, c.envelope, 1, c.seq
            FROM commands c
            JOIN messages m ON m.id = json_extract(c.envelope, '$.payload.message_id')
            LEFT JOIN users u ON u.id = m.sender_id
           WHERE c.cmd = '${pinMessageCommand.name}' AND m.crew_id = ${crew}
             AND m.deleted_at IS NULL AND c.status <> 'done'
           ORDER BY queued, qseq`;
}

/** The pins the rows describe, newest first; queued commands win over the synced state. */
export function pinsFrom(rows: readonly PinRow[]): PinnedMessage[] {
  const pins = new Map<string, PinnedMessage>();
  for (const row of rows) {
    const message: PinnedMessage = {
      id: row.id,
      body: row.body ?? '',
      type: row.type,
      senderName: row.sender_name,
      pinnedAt: row.pinned_at,
    };
    if (row.envelope === null) {
      pins.set(row.id, message);
      continue;
    }
    const payload = (JSON.parse(row.envelope) as { payload?: Partial<PinMessagePayload> }).payload;
    if (payload?.pinned === true) pins.set(row.id, pins.get(row.id) ?? message);
    else pins.delete(row.id);
  }
  return [...pins.values()].sort((a, b) => (b.pinnedAt ?? '￿').localeCompare(a.pinnedAt ?? '￿'));
}

export async function loadPins(
  db: AbstractPowerSyncDatabase,
  crewId: string,
): Promise<PinnedMessage[]> {
  return pinsFrom(await db.getAll<PinRow>(pinsSql(crewId)));
}

export function usePins(crewId: string) {
  const { db, commands } = useLocalFirst();
  const [pins, setPins] = useState<readonly PinnedMessage[]>([]);
  useEffect(
    () => watchRows<PinRow>(db, pinsSql(crewId), TABLES, (rows) => setPins(pinsFrom(rows))),
    [db, crewId],
  );
  const pinnedIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  const isPinned = useCallback((messageId: string) => pinnedIds.has(messageId), [pinnedIds]);
  const setPinned = useCallback(
    (messageId: string, pinned: boolean) =>
      commands.send(pinMessageCommand, { message_id: messageId, pinned }),
    [commands],
  );
  return { pins, isPinned, setPinned };
}
