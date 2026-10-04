/**
 * An organiser's private ask about my saves (Balance the crew's ASK FIRST), as the asked member
 * reads it: the open ask on my own stream (only the asker and I can read it), who asked, and the
 * saves it would add. The organiser's own asks, by member, for the balance screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { textArray } from '@/data/ideas/use-trip-ideas';
import { useLiveRows } from '@/data/plan/live-rows';

const ASKS_SQL = `SELECT a.id, a.asked_by, a.member_id, a.idea_ids, a.status
  FROM member_asks a WHERE a.trip_id = ? ORDER BY a.created_at DESC`;
const ASKS_TABLES = ['member_asks'];
const NAMES_SQL = `SELECT id, name FROM trip_ideas WHERE trip_id = ?`;
const NAMES_TABLES = ['trip_ideas'];

interface AskRow {
  readonly id: string;
  readonly asked_by: string;
  readonly member_id: string;
  readonly idea_ids: string | null;
  readonly status: string;
}

export interface MemberAsk {
  readonly id: string;
  readonly askedBy: string;
  readonly memberId: string;
  readonly status: string;
  readonly places: readonly string[];
}

export function useMemberAsks(tripId: string | null): readonly MemberAsk[] {
  const asks = useLiveRows<AskRow>(ASKS_SQL, tripId === null ? null : [tripId], ASKS_TABLES);
  const names = useLiveRows<{ id: string; name: string }>(
    NAMES_SQL,
    tripId === null ? null : [tripId],
    NAMES_TABLES,
  );
  return useMemo(() => {
    const byId = new Map(names.rows.map((row) => [row.id, row.name]));
    return asks.rows.map((row) => ({
      id: row.id,
      askedBy: row.asked_by,
      memberId: row.member_id,
      status: row.status,
      places: textArray(row.idea_ids).flatMap((id) => {
        const name = byId.get(id);
        return name === undefined ? [] : [name];
      }),
    }));
  }, [asks.rows, names.rows]);
}
