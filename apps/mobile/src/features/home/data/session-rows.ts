/**
 * Two small reads Home needs from rows other areas own: the signed-in uid the local database is
 * bound to, and the crew chat's unread count for the crew pill (crewmates' and the guide's messages
 * numbered past the member's `last_read_seq`, the same rule the chat itself applies).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useSessionUid } from '@/data/powersync/use-session-uid';

import { useLiveRows } from './watch-query';

export function useOwnerUid(): string | null {
  return useSessionUid();
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

const OTHER_UNREAD_SQL = `SELECT 1 AS n FROM messages m
  JOIN crew_members cm ON cm.crew_id = m.crew_id AND cm.user_id = ? AND cm.status = 'active'
  WHERE m.crew_id <> ? AND m.sender_kind <> 'system' AND m.deleted_at IS NULL
    AND (m.sender_id IS NULL OR m.sender_id <> ?)
    AND m.seq > coalesce(cm.last_read_seq, 0)
  LIMIT 1`;

/** Whether any other crew the member is in has chat they have not read (the switcher's dot). */
export function useOtherCrewsUnread(crewId: string, uid: string): boolean {
  const { rows } = useLiveRows<{ n: number }>(
    OTHER_UNREAD_SQL,
    [uid, crewId, uid],
    ['messages', 'crew_members'],
  );
  return rows.length > 0;
}
