/**
 * One trip's plan from the local database, as every plan surface reads it: the trip with my role,
 * the crew, the version's days and items (the crew's current version, or an organiser's draft
 * before there is one), with the signed-in member's queued edits replayed on top (so a drag or an
 * add shows at once, offline too) and the items a queued edit or an open proposal touches marked. Replay is lenient: an edit
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
import { useActiveLocale } from '@/lib/i18n/use-locale';

import { APPLY_DRAFT_OPS, APPLY_PLAN_OPS } from './commands';
import { useLiveRows } from './live-rows';
import { displayOf, placeNamesOf, themesAsRead, toPlanState, type ItemDisplay } from './plan-model';
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
  UID_SQL,
  UID_TABLES,
  VERSION_PLACES_SQL,
  VERSION_PLACES_TABLES,
  type ChangesetRow,
  type MemberRow,
  type PlanDayRow,
  type PlanItemRow,
  type PlanTripRow,
  type QueuedRow,
} from './queries';

export interface PlanMember {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

/**
 * Which version to read: the crew's current one (the day view, editing), or, while there is none
 * yet, an organiser's own unproposed draft (the overview shows it).
 */
export type PlanVersionChoice = 'current' | 'draft-or-current';

export interface TripPlanOptions {
  readonly version?: PlanVersionChoice;
}

export interface TripPlan {
  readonly loaded: boolean;
  /** The signed-in uid has been read (it may still be null: signed out). */
  readonly uidLoaded: boolean;
  readonly uid: string | null;
  readonly trip: PlanTripRow | null;
  /** The version read: the crew's current one, or (organisers only) the unproposed draft. */
  readonly versionId: string | null;
  readonly mode: 'group' | 'draft';
  readonly organiser: boolean;
  /** Organisers edit directly; everyone else proposes a change set. */
  readonly canApply: boolean;
  /** Active crew members in join order. */
  readonly members: readonly PlanMember[];
  /** Every crew row in join order, active or not (colours follow the whole crew's join order). */
  readonly crew: readonly MemberRow[];
  readonly dayRows: readonly PlanDayRow[];
  readonly itemRows: readonly PlanItemRow[];
  /** The version's own place names, by place id. */
  readonly places: ReadonlyMap<string, string>;
  /** The synced plan (what the server has). */
  readonly synced: PlanState;
  /** The synced plan with my queued edits replayed. */
  readonly state: PlanState;
  readonly display: ReadonlyMap<string, ItemDisplay>;
  /** Day themes in the app's language, keyed by the theme as written. */
  readonly themes: ReadonlyMap<string, string>;
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
  /** The command that edits the version read: the crew's plan, or the organiser's own draft. */
  command: string = APPLY_PLAN_OPS,
): { state: PlanState; touched: Set<string> } {
  let state = synced;
  const touched = new Set<string>();
  for (const row of queued) {
    if (row.cmd !== command) continue;
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

export function useTripPlan(tripId: string | null, options: TripPlanOptions = {}): TripPlan {
  const choice = options.version ?? 'current';
  const uidRows = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES);
  const uid = uidRows.rows[0]?.value ?? null;
  const tripRows = useLiveRows<PlanTripRow>(
    TRIP_SQL,
    tripId === null ? null : [uid ?? '', tripId],
    TRIP_TABLES,
  );
  const trip = tripRows.rows[0] ?? null;
  const organiser = trip?.role === 'organiser';
  const mode =
    choice === 'draft-or-current' &&
    trip !== null &&
    trip.current_version_id === null &&
    organiser &&
    trip.draft_version_id !== null
      ? 'draft'
      : 'group';
  const version =
    trip === null ? null : mode === 'draft' ? trip.draft_version_id : trip.current_version_id;
  const crew = useLiveRows<MemberRow>(
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
  const coverage = useLiveRows<{ coverage: string | null; picked: string | null }>(
    VERSION_PLACES_SQL,
    version === null ? null : [version],
    VERSION_PLACES_TABLES,
  );
  const places = useMemo(
    () => placeNamesOf(coverage.rows[0]?.coverage ?? null, coverage.rows[0]?.picked ?? null),
    [coverage.rows],
  );
  const queued = useLiveRows<QueuedRow>(QUEUED_PLAN_SQL, [], QUEUED_PLAN_TABLES);
  const locale = useActiveLocale();
  const changesets = useLiveRows<ChangesetRow>(
    OPEN_CHANGESETS_SQL,
    tripId === null ? null : [tripId],
    CHANGESETS_TABLES,
  );

  return useMemo(() => {
    const synced = version === null ? EMPTY : toPlanState(days.rows, items.rows);
    const edits = mode === 'draft' ? APPLY_DRAFT_OPS : APPLY_PLAN_OPS;
    const replay = tripId === null ? null : replayQueued(synced, queued.rows, tripId, edits);
    const proposed = new Map<string, string | null>();
    for (const set of changesets.rows) {
      for (const op of parseOps(set.ops)) proposed.set(op.target, set.author_id);
    }
    for (const row of queued.rows) {
      const payload =
        row.cmd === APPLY_PLAN_OPS || row.cmd === APPLY_DRAFT_OPS
          ? null
          : payloadOf<CreateChangesetPayload>(row);
      if (payload === null || payload.trip_id !== tripId) continue;
      for (const op of payload.ops) proposed.set(op.target, uid);
    }
    return {
      loaded: tripRows.loaded && (version === null || (days.loaded && items.loaded)),
      uidLoaded: uidRows.loaded,
      uid,
      trip,
      versionId: version,
      mode,
      organiser,
      canApply: organiser,
      members: crew.rows
        .filter((row) => row.status === 'active')
        .map((row, joinIndex) => ({ uid: row.user_id, name: row.display_name ?? '', joinIndex })),
      crew: crew.rows,
      dayRows: days.rows,
      itemRows: items.rows,
      places,
      synced,
      state: replay?.state ?? synced,
      display: displayOf(items.rows, locale, places),
      themes: themesAsRead(days.rows, locale),
      queued: replay?.touched ?? new Set<string>(),
      proposed,
      openChangesets: changesets.rows,
    };
  }, [
    tripId,
    uid,
    uidRows.loaded,
    trip,
    version,
    mode,
    organiser,
    tripRows.loaded,
    crew.rows,
    days.rows,
    days.loaded,
    items.rows,
    items.loaded,
    queued.rows,
    changesets.rows,
    locale,
    places,
  ]);
}
