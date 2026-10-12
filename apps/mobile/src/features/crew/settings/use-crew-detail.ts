/**
 * One crew as its settings, edit and member pages read it: the crew row, its active members in join
 * order, the caller's own membership and what they may do (only an organiser or the crew's creator
 * manages members; only the organiser hands the crew over), its live code with the expiry the server
 * gave it, and its trips still going.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useContext, useEffect, useMemo, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { watchRows } from '@/data/status/watch-rows';

import {
  useCrews,
  type CodeRow,
  type CrewMemberRow,
  type CrewRow,
  type TripHeader,
} from '../crews-sheet/crew-data';

export interface CrewDetail {
  readonly loaded: boolean;
  readonly uid: string | null;
  readonly crew: CrewRow | null;
  readonly members: readonly CrewMemberRow[];
  readonly me: CrewMemberRow | null;
  /** Organiser or the crew's creator: invites, removes, rotates the code, edits. */
  readonly canManage: boolean;
  /** Holds the crew's organiser role: hands it over before leaving. */
  readonly isOrganiser: boolean;
  readonly code: CodeRow | null;
  readonly trips: readonly TripHeader[];
}

export function crewDetailOf(
  snapshot: ReturnType<typeof useCrews>,
  crewId: string,
  uid: string | null,
): CrewDetail {
  const crew = snapshot.crews.find((c) => c.id === crewId) ?? null;
  const members = snapshot.members.filter((m) => m.crew_id === crewId);
  const me = members.find((m) => m.user_id === uid) ?? null;
  const isOrganiser = me?.role === 'organiser';
  return {
    loaded: snapshot.loaded,
    uid,
    crew,
    members,
    me,
    isOrganiser,
    canManage: isOrganiser || (crew !== null && crew.created_by === uid && uid !== null),
    code: snapshot.codes.find((c) => c.crew_id === crewId) ?? null,
    trips: snapshot.trips.filter((trip) => trip.crew_id === crewId),
  };
}

export function useCrewDetail(crewId: string): CrewDetail {
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const snapshot = useCrews(localFirst?.db ?? null, uid);
  return useMemo(() => crewDetailOf(snapshot, crewId, uid), [snapshot, crewId, uid]);
}

const UUID = /^[0-9a-f-]{36}$/iu;

/** The referral stamps on the caller's pass: they unlock the earned covers. */
export function useReferralStamps(): number {
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const [count, setCount] = useState(0);
  const db = localFirst?.db ?? null;
  useEffect(() => {
    if (db === null || uid === null || !UUID.test(uid)) return undefined;
    return watchRows<{ n: number }>(
      db,
      `SELECT count(*) AS n FROM stamps WHERE user_id = '${uid}' AND kind = 'referral'`,
      ['stamps'],
      (rows) => setCount(rows[0]?.n ?? 0),
    );
  }, [db, uid]);
  return count;
}
