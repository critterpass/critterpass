/**
 * One trip's group plan from the local database: the current version's days and items, with the
 * signed-in member's queued edits replayed on top (so a drag or an add shows at once, offline
 * too) and the items a queued edit or an open proposal touches marked. Replay is lenient: an edit
 * the synced plan can no longer take (the item went) is skipped here and settled by the server.
 */
import {
  applyPlanEdits,
  planOpsToEdits,
  type ApplyPlanOpsPayload,
  type ChangeSetOp,
  type CreateChangesetPayload,
  type PlanState,
} from '@cp/domain';
import { useMemo } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { APPLY_PLAN_OPS } from './commands';
import { useLiveRows } from './live-rows';
import {
  displayOf,
  toPlanState,
  type ItemDisplay,
  type PlanDayRow,
  type PlanItemRow,
} from './plan-model';
import { opTargets } from './plan-ops';
import {
  CHANGESETS_TABLES,
  DAYS_SQL,
  DAYS_TABLES,
  ITEMS_SQL,
  ITEMS_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  OPEN_CHANGESETS_SQL,
  QUEUED_PLAN_SQL,
  QUEUED_PLAN_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type ChangesetRow,
  type MemberRow,
  type QueuedRow,
  type TripRow,
} from './queries';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
const UID_TABLES = ['local_state'];
/* eslint-enable lingui/no-unlocalized-strings */

export interface PlanMember {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

export interface TripPlan {
  readonly loaded: boolean;
  readonly uid: string | null;
  readonly trip: TripRow | null;
  /** Organisers edit directly; everyone else proposes a change set. */
  readonly canApply: boolean;
  readonly members: readonly PlanMember[];
  /** The synced plan (what the server has). */
  readonly synced: PlanState;
  /** The synced plan with my queued edits replayed. */
  readonly state: PlanState;
  readonly display: ReadonlyMap<string, ItemDisplay>;
  /** Stable ids a queued edit of mine touches. */
  readonly queued: ReadonlySet<string>;
  /** Stable ids an open or queued proposal touches, with who proposed it. */
  readonly proposed: ReadonlyMap<string, string | null>;
  readonly openChangesets: readonly ChangesetRow[];
}

const EMPTY: PlanState = { days: [], items: [] };

function payloadOf<T>(row: QueuedRow): T | null {
  try {
    return (JSON.parse(row.envelope) as { payload?: T }).payload ?? null;
  } catch {
    return null;
  }
}

function parseOps(raw: string | null): ChangeSetOp[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ChangeSetOp[]) : [];
  } catch {
    return [];
  }
}

export function replayQueued(
  synced: PlanState,
  queued: readonly QueuedRow[],
  tripId: string,
): { state: PlanState; touched: Set<string> } {
  let state = synced;
  const touched = new Set<string>();
  for (const row of queued) {
    if (row.cmd !== APPLY_PLAN_OPS) continue;
    const payload = payloadOf<ApplyPlanOpsPayload>(row);
    if (payload === null || payload.trip_id !== tripId) continue;
    for (const edit of planOpsToEdits(payload.ops)) {
      try {
        state = applyPlanEdits(state, [edit]);
      } catch {
        // The synced plan moved on without this item; the server answers for it.
      }
    }
    opTargets(payload.ops).forEach((id) => touched.add(id));
  }
  return { state, touched };
}

export function useTripPlan(tripId: string | null): TripPlan {
  const uidRows = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES);
  const uid = uidRows.rows[0]?.value ?? null;
  const tripRows = useLiveRows<TripRow>(
    TRIP_SQL,
    tripId === null ? null : [uid ?? '', tripId],
    TRIP_TABLES,
  );
  const trip = tripRows.rows[0] ?? null;
  const version = trip?.current_version_id ?? null;
  const members = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    trip === null ? null : [trip.crew_id],
    MEMBERS_TABLES,
  );
  const days = useLiveRows<PlanDayRow>(DAYS_SQL, version === null ? null : [version], DAYS_TABLES);
  const items = useLiveRows<PlanItemRow>(
    ITEMS_SQL,
    version === null ? null : [version],
    ITEMS_TABLES,
  );
  const queued = useLiveRows<QueuedRow>(QUEUED_PLAN_SQL, [], QUEUED_PLAN_TABLES);
  const changesets = useLiveRows<ChangesetRow>(
    OPEN_CHANGESETS_SQL,
    tripId === null ? null : [tripId],
    CHANGESETS_TABLES,
  );

  return useMemo(() => {
    const synced = version === null ? EMPTY : toPlanState(days.rows, items.rows);
    const replay = tripId === null ? null : replayQueued(synced, queued.rows, tripId);
    const proposed = new Map<string, string | null>();
    for (const set of changesets.rows) {
      for (const op of parseOps(set.ops)) proposed.set(op.target, set.author_id);
    }
    for (const row of queued.rows) {
      const payload = row.cmd === APPLY_PLAN_OPS ? null : payloadOf<CreateChangesetPayload>(row);
      if (payload === null || payload.trip_id !== tripId) continue;
      for (const op of payload.ops) proposed.set(op.target, uid);
    }
    return {
      loaded: tripRows.loaded && (version === null || (days.loaded && items.loaded)),
      uid,
      trip,
      canApply: trip?.role === 'organiser',
      members: members.rows.map((row, joinIndex) => ({
        uid: row.user_id,
        name: row.display_name ?? '',
        joinIndex,
      })),
      synced,
      state: replay?.state ?? synced,
      display: displayOf(items.rows),
      queued: replay?.touched ?? new Set<string>(),
      proposed,
      openChangesets: changesets.rows,
    };
  }, [
    tripId,
    uid,
    trip,
    version,
    tripRows.loaded,
    members.rows,
    days.rows,
    days.loaded,
    items.rows,
    items.loaded,
    queued.rows,
    changesets.rows,
  ]);
}
