/**
 * `useHomeState`: everything Home shows, from synced rows and the mode machine, so Home renders
 * offline and counts down locally. The skeleton shows only on a first sync with nothing local yet:
 * once any row of the user's own is here (or the app is offline), Home picks a mode.
 */
import { deriveHomeState, type HomeState } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { useSyncStatus } from '@/data/status/use-sync-status';

import { useHomeVote } from '../slots';
import { useOwnerUid } from './session-rows';
import {
  CREWS_SQL,
  CREWS_TABLES,
  firstName,
  GUIDE_CELLS_SQL,
  GUIDE_CELLS_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  NEEDS_YOU_SQL,
  NEEDS_YOU_TABLES,
  pickCrew,
  PROFILE_SQL,
  PROFILE_TABLES,
  TIP_SQL,
  TIP_TABLES,
  toTripInput,
  TRIPS_SQL,
  TRIPS_TABLES,
  type CrewRow,
  type GuideCellRow,
  type MemberRow,
  type ProfileRow,
  type TipRow,
  type TripRow,
} from './home-queries';
import { useLiveRows } from './watch-query';
import { memberFirstName } from '@/ui/people/member-name';

export interface HomeMember {
  readonly userId: string;
  readonly name: string;
  readonly colour: string | null;
  readonly joinIndex: number;
}

export interface HomeCrew {
  readonly id: string;
  readonly name: string;
  readonly members: readonly HomeMember[];
}

export interface HomeView {
  readonly status: 'loading' | 'ready';
  readonly uid: string | null;
  readonly firstName: string;
  readonly crew: HomeCrew | null;
  readonly home: HomeState;
  readonly tip: TipRow | null;
  readonly needsYou: number;
  readonly guideCells: readonly GuideCellRow[];
}

const MINUTE = 60_000;

/** "Now" to the minute, as an ISO string: stable query parameters that still roll forward. */
const systemNow = (): Date => new Date();

export function useMinuteClock(now: () => Date = systemNow): string {
  const [at, setAt] = useState(() => new Date(Math.floor(now().getTime() / MINUTE) * MINUTE));
  useEffect(() => {
    const timer = setInterval(
      () => setAt(new Date(Math.floor(now().getTime() / MINUTE) * MINUTE)),
      MINUTE,
    );
    return () => clearInterval(timer);
  }, [now]);
  return at.toISOString();
}

/** How long a first sync may hold Home on its skeleton before Home shows what it has. */
export const FIRST_SYNC_PATIENCE_MS = 4000;

/** False until `ms` have passed since mount. */
export function useElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return elapsed;
}

export function useHomeState(requestedCrewId: string | null = null): HomeView {
  const uid = useOwnerUid();
  const minute = useMinuteClock();
  const sync = useSyncStatus();
  const patienceOver = useElapsed(FIRST_SYNC_PATIENCE_MS);
  const profile = useLiveRows<ProfileRow>(PROFILE_SQL, uid === null ? null : [uid], PROFILE_TABLES);
  const crews = useLiveRows<CrewRow>(CREWS_SQL, uid === null ? null : [uid], CREWS_TABLES);
  const me = profile.rows[0] ?? null;
  const crewRow = pickCrew(crews.rows, requestedCrewId, me?.active_crew_id ?? null);
  const crewId = crewRow?.id ?? null;
  const members = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    crewId === null ? null : [crewId],
    MEMBERS_TABLES,
  );
  const trips = useLiveRows<TripRow>(
    TRIPS_SQL,
    uid === null || crewId === null ? null : [uid, crewId],
    TRIPS_TABLES,
  );
  const tips = useLiveRows<TipRow>(
    TIP_SQL,
    uid === null || crewId === null ? null : [crewId, minute, uid],
    TIP_TABLES,
  );
  const needs = useLiveRows<{ n: number }>(
    NEEDS_YOU_SQL,
    uid === null ? null : [uid, minute],
    NEEDS_YOU_TABLES,
  );
  const cells = useLiveRows<GuideCellRow>(GUIDE_CELLS_SQL, [], GUIDE_CELLS_TABLES);
  const vote = useHomeVote(crewId);

  return useMemo(() => {
    const tripInputs = trips.rows.map(toTripInput);
    const home = deriveHomeState({
      hasCrew: crewRow !== null,
      trips: tripInputs,
      vote,
      now: new Date(minute),
    });
    const nothingLocal = me === null && crews.rows.length === 0;
    const firstSync =
      sync.lastSyncedAt === null && (sync.phase === 'connecting' || sync.phase === 'catching_up');
    // A sync that never arrives (offline, a slow server) must not hold Home on the skeleton.
    const waiting = uid === null || !crews.loaded || (nothingLocal && firstSync);
    const loading = waiting && !patienceOver;
    return {
      status: loading ? 'loading' : 'ready',
      uid,
      firstName: firstName(me?.display_name),
      crew:
        crewRow === null
          ? null
          : {
              id: crewRow.id,
              name: crewRow.name ?? '',
              members: members.rows.map((row, index) => ({
                userId: row.user_id,
                name: memberFirstName(row.display_name),
                colour: row.colour,
                joinIndex: index,
              })),
            },
      home,
      tip: tips.rows[0] ?? null,
      needsYou: Number(needs.rows[0]?.n ?? 0),
      guideCells: cells.rows,
    };
  }, [
    uid,
    minute,
    sync.lastSyncedAt,
    sync.phase,
    patienceOver,
    me,
    crews,
    crewRow,
    members.rows,
    trips.rows,
    tips.rows,
    needs.rows,
    cells.rows,
    vote,
  ]);
}
