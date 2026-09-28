/**
 * Two small reads Home needs from rows other areas own: the signed-in uid the local database is
 * bound to, and the crew chat's unread count for the crew pill (crewmates' and the guide's messages
 * numbered past the member's `last_read_seq`, the same rule the chat itself applies).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from './watch-query';

const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';

export function useOwnerUid(): string | null {
  const { rows } = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], ['local_state']);
  return rows[0]?.value ?? null;
}

const UNREAD_SQL = `SELECT count(*) AS n FROM messages m
  WHERE m.crew_id = ? AND m.sender_kind <> 'system' AND m.deleted_at IS NULL
    AND (m.sender_id IS NULL OR m.sender_id <> ?)
    AND m.seq > coalesce((SELECT last_read_seq FROM crew_members
                           WHERE crew_id = ? AND user_id = ?), 0)`;

export function useChatUnread(crewId: string, uid: string): number {
  const { rows } = useLiveRows<{ n: number }>(
    UNREAD_SQL,
    [crewId, uid, crewId, uid],
    ['messages', 'crew_members'],
  );
  return Number(rows[0]?.n ?? 0);
}
