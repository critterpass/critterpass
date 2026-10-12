/**
 * The crew switcher's rows: the caller's crews (members in join order), which one Home shows, the
 * unread chat per crew, switching (queued offline, like the crews sheet) and the in-app invites
 * waiting, answered from the menu itself (3.07 draws them as rows: "Dev invited you").
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { useContext, useMemo } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import {
  ACCEPT_INVITE,
  crewCards,
  inviteCards,
  SET_ACTIVE_CREW,
  useCrews,
  type CrewCardView,
  type InviteCardView,
} from '@/features/crew';

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
  /** In-app invites waiting, the ones not yet put off first. */
  readonly invites: readonly InviteCardView[];
  readonly pick: (crewId: string) => void;
  /** Joins the invite's crew; resolves whether the server took it (it needs a connection). */
  readonly join: (invite: InviteCardView) => Promise<boolean>;
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
    invites: inviteCards(snapshot, new Date()).sort((a, b) => Number(a.later) - Number(b.later)),
    pick: (crewId) => {
      if (localFirst !== null) void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: crewId });
    },
    join: async (invite) => {
      if (localFirst === null) return false;
      const sent = await localFirst.commands.send(ACCEPT_INVITE, { invite_id: invite.id });
      if (sent.kind !== 'applied') return false;
      void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: invite.crewId });
      return true;
    },
  };
}
