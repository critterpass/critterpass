/**
 * Leave-bys as views, from synced rows plus what is still in my upload queue (an "I'm up" or a
 * snooze sent offline counts at once) and what the `trip_dayof` channel says (a crewmate's "I'm
 * up" shows within the second, before their row syncs).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { ReadinessState } from '@cp/domain';
import { useMemo, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { useLiveRows } from '../hub/data/live-rows';

import { SET_READINESS, SNOOZE_LEAVE_BY } from './commands';
import {
  buildLeaveBy,
  type CrewMember,
  type LeaveByRow,
  type LeaveByView,
  type ReadinessRow,
} from './model';

const LEAVE_BY_COLUMNS = `id, trip_id, plan_item_id, title, place_name, local_date, starts_at,
  leave_at, pickup_at, tz, legs, alarm_policy, pickup, buffer_min, guide_note, participant_ids, state`;

/** One trip's leave-bys on one local date. */
export const DAY_LEAVE_BYS_SQL = `SELECT ${LEAVE_BY_COLUMNS} FROM leave_bys
  WHERE trip_id = ? AND local_date = ? AND state <> 'cancelled' ORDER BY leave_at`;
/** Every leave-by still ahead (or just gone), across trips, for the alarm sync. */
export const UPCOMING_LEAVE_BYS_SQL = `SELECT ${LEAVE_BY_COLUMNS} FROM leave_bys
  WHERE state NOT IN ('cancelled', 'departed') AND julianday(leave_at) > julianday(?)
  ORDER BY leave_at`;
export const LEAVE_BY_TABLES = ['leave_bys'];

export const TRIP_READINESS_SQL = `SELECT leave_by_id, user_id, state, snooze_count, knock_sent_at
  FROM readiness WHERE trip_id = ?`;
export const MY_READINESS_SQL = `SELECT leave_by_id, user_id, state, snooze_count, knock_sent_at
  FROM readiness WHERE user_id = ?`;
export const READINESS_TABLES = ['readiness'];

export const PENDING_DAY_SQL = `SELECT cmd, json_extract(envelope, '$.payload.leave_by_id') AS leave_by_id,
    json_extract(envelope, '$.payload.state') AS state,
    json_extract(envelope, '$.payload.count') AS count
  FROM commands WHERE cmd IN ('${SET_READINESS}', '${SNOOZE_LEAVE_BY}') ORDER BY seq`;
export const PENDING_TABLES = ['commands'];

interface PendingRow {
  readonly cmd: string;
  readonly leave_by_id: string | null;
  readonly state: string | null;
  readonly count: number | null;
}

const EMPTY_LIVE: ReadonlyMap<string, ReadonlySet<string>> = new Map();

export interface PendingDay {
  readonly readiness: ReadonlyMap<string, ReadinessState>;
  readonly snoozes: ReadonlyMap<string, number>;
}

export function pendingDay(rows: readonly PendingRow[]): PendingDay {
  const readiness = new Map<string, ReadinessState>();
  const snoozes = new Map<string, number>();
  for (const row of rows) {
    if (row.leave_by_id === null) continue;
    if (row.cmd === SET_READINESS && (row.state === 'up' || row.state === 'not_up')) {
      readiness.set(row.leave_by_id, row.state);
    } else if (row.cmd === SNOOZE_LEAVE_BY) {
      const next = row.count ?? (snoozes.get(row.leave_by_id) ?? 0) + 1;
      snoozes.set(row.leave_by_id, Math.max(next, snoozes.get(row.leave_by_id) ?? 0));
    }
  }
  return { readiness, snoozes };
}

export interface LeaveByInputs {
  readonly rows: readonly LeaveByRow[];
  readonly readiness: readonly ReadinessRow[];
  readonly pending: PendingDay;
  readonly members: readonly CrewMember[];
  readonly me: string;
  readonly now: Date;
  readonly liveUp?: ReadonlyMap<string, ReadonlySet<string>>;
}

export function leaveByViews(input: LeaveByInputs): LeaveByView[] {
  return input.rows.map((row) => {
    const readiness = input.readiness
      .filter((r) => r.leave_by_id === row.id)
      .map((r) =>
        r.user_id === input.me
          ? {
              ...r,
              snooze_count: Math.max(r.snooze_count ?? 0, input.pending.snoozes.get(row.id) ?? 0),
            }
          : r,
      );
    if (!readiness.some((r) => r.user_id === input.me) && input.pending.snoozes.has(row.id)) {
      readiness.push({
        leave_by_id: row.id,
        user_id: input.me,
        state: 'not_up',
        snooze_count: input.pending.snoozes.get(row.id) ?? 0,
        knock_sent_at: null,
      });
    }
    return buildLeaveBy({
      row,
      readiness,
      members: input.members,
      me: input.me,
      now: input.now,
      myPending: input.pending.readiness.get(row.id) ?? null,
      liveUp: input.liveUp?.get(row.id) ?? null,
    });
  });
}

/** Who is up per leave-by, from `trip_dayof` `readiness` envelopes, until the rows catch up. */
export function useLiveReadiness(
  tripId: string | null,
  syncedKey: string,
): ReadonlyMap<string, ReadonlySet<string>> {
  const [live, setLive] = useState<{
    readonly key: string;
    readonly up: ReadonlyMap<string, ReadonlySet<string>>;
  }>({ key: syncedKey, up: new Map() });
  useChannel('trip_dayof', tripId, {
    onEvent: (envelope) => {
      if (envelope.type !== 'readiness') return;
      const data = envelope.data as { leave_by_id?: unknown; up?: unknown };
      if (typeof data.leave_by_id !== 'string' || !Array.isArray(data.up)) return;
      const up = new Set(data.up.filter((id): id is string => typeof id === 'string'));
      const leaveById = data.leave_by_id;
      setLive((current) => ({
        key: syncedKey,
        up: new Map(current.key === syncedKey ? current.up : []).set(leaveById, up),
      }));
    },
  });
  // Newer synced rows replace what the channel said.
  return live.key === syncedKey ? live.up : EMPTY_LIVE;
}

/** One trip day's leave-bys, live. */
export function useDayLeaveBys(input: {
  readonly tripId: string | null;
  readonly date: string | null;
  readonly me: string | null;
  readonly members: readonly CrewMember[];
  readonly now: Date;
}): { readonly views: readonly LeaveByView[]; readonly loaded: boolean } {
  const { tripId, date, me } = input;
  const rows = useLiveRows<LeaveByRow>(
    DAY_LEAVE_BYS_SQL,
    tripId === null || date === null ? null : [tripId, date],
    LEAVE_BY_TABLES,
  );
  const readiness = useLiveRows<ReadinessRow>(
    TRIP_READINESS_SQL,
    tripId === null ? null : [tripId],
    READINESS_TABLES,
  );
  const pending = useLiveRows<PendingRow>(PENDING_DAY_SQL, [], PENDING_TABLES);
  const liveUp = useLiveReadiness(tripId, JSON.stringify(readiness.rows));
  const views = useMemo(
    () =>
      me === null
        ? []
        : leaveByViews({
            rows: rows.rows,
            readiness: readiness.rows,
            pending: pendingDay(pending.rows),
            members: input.members,
            me,
            now: input.now,
            liveUp,
          }),
    [rows.rows, readiness.rows, pending.rows, input.members, me, input.now, liveUp],
  );
  return { views, loaded: rows.loaded && readiness.loaded };
}
