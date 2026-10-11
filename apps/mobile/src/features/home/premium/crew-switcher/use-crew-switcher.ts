/**
 * The crew switcher's rows: the caller's crews (members in join order), which one Home shows, the
 * unread chat per crew, and switching (queued offline, like the crews sheet). Pending in-app
 * invites stay on the crews sheet, which the menu links to.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { useContext, useMemo } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { SET_ACTIVE_CREW } from '@/features/crew/crews-sheet/crew-commands';
import { useCrews } from '@/features/crew/crews-sheet/crew-data';
import { crewCards, inviteCards, type CrewCardView } from '@/features/crew/crews-sheet/crew-view';

import { useLiveRows } from '../../data/watch-query';

const UNREAD_SQL = `SELECT m.crew_id, count(*) AS n FROM messages m
  JOIN crew_members cm ON cm.crew_id = m.crew_id AND cm.user_id = ? AND cm.status = 'active'
  WHERE m.sender_kind <> 'system' AND m.deleted_at IS NULL
    AND (m.sender_id IS NULL OR m.sender_id <> ?)
    AND m.seq > coalesce(cm.last_read_seq, 0)
  GROUP BY m.crew_id`;
const UNREAD_TABLES = ['messages', 'crew_members'];

export interface SwitcherCrew extends CrewCardView {
  readonly unread: number;
}

export interface CrewSwitcher {
  readonly crews: readonly SwitcherCrew[];
  /** In-app invites waiting on the crews sheet. */
  readonly invites: number;
  readonly pick: (crewId: string) => void;
}

export function useCrewSwitcher(): CrewSwitcher {
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const snapshot = useCrews(localFirst?.db ?? null, uid);
  const unread = useLiveRows<{ crew_id: string; n: number }>(
    UNREAD_SQL,
    uid === null ? null : [uid, uid],
    UNREAD_TABLES,
  );
  const crews = useMemo(() => {
    const counts = new Map(unread.rows.map((row) => [row.crew_id, Number(row.n)]));
    return crewCards(snapshot).map((crew) => ({ ...crew, unread: counts.get(crew.id) ?? 0 }));
  }, [snapshot, unread.rows]);
  return {
    crews,
    invites: inviteCards(snapshot, new Date()).length,
    pick: (crewId) => {
      if (localFirst !== null) void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: crewId });
    },
  };
}
