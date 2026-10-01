/**
 * What the rooms step reads from the local database: the plan and who sleeps where (synced), the
 * destination's stay types for picking one, this person's own room wishes (the `me` stream), and
 * this phone's queued room commands, which show at once on top of the synced rows. Also the
 * latest refused move, so a version conflict can be explained and re-applied.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import { useLiveRows } from '../data/rows';
import type { RoomChipKey } from './copy';
import {
  buildPlan,
  type AssignmentRow,
  type PendingRooms,
  type PlanRow,
  type RoomsPlan,
} from './model';

const PLAN_SQL = `SELECT stay_option_id, rooms, currency, version, same_pairs_all_stays, locked_at,
    stay_booking_id, free_cancel_until
  FROM room_plans WHERE trip_id = ?`;
const ASSIGN_SQL = `SELECT stay_key, room_key, user_id, trait_label FROM room_assignments
  WHERE trip_id = ? ORDER BY created_at, user_id`;
const PENDING_SQL = `SELECT cmd, envelope FROM commands
  WHERE cmd IN ('set_room_assignment', 'set_room_prefs', 'request_room_swap')
    AND json_extract(envelope, '$.payload.trip_id') = ?
  ORDER BY seq`;
const PREFS_SQL = 'SELECT chips FROM room_prefs WHERE trip_id = ? AND user_id = ?';
const STAYS_SQL = `SELECT c.stay_type, c.nightly_minor_low, c.nightly_minor_high, c.currency
  FROM destination_cost_indices c JOIN trips t ON t.destination_id = c.destination_id
  WHERE t.id = ? AND c.reviewed_at IS NOT NULL ORDER BY c.nightly_minor_low, c.stay_type`;
const REJECTED_SQL = `SELECT id, rejected_at FROM rejected_commands
  WHERE cmd = 'set_room_assignment' AND code = 'VERSION_CONFLICT'
  ORDER BY rejected_at DESC LIMIT 1`;

export interface StayRateRow {
  readonly stay_type: string;
  readonly nightly_minor_low: number;
  readonly nightly_minor_high: number;
  readonly currency: string;
}

export interface RoomsData {
  readonly loaded: boolean;
  readonly plan: RoomsPlan | null;
  readonly stays: readonly StayRateRow[];
  readonly myChips: readonly RoomChipKey[];
  readonly swapQueued: boolean;
  readonly conflict: { readonly id: string; readonly at: string } | null;
}

function parseChips(value: string | null | undefined): RoomChipKey[] {
  if (value === null || value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RoomChipKey[]) : [];
  } catch {
    return value
      .replace(/[{}"]/gu, '')
      .split(',')
      .filter((chip) => chip !== '') as RoomChipKey[];
  }
}

interface PendingRow {
  readonly cmd: string;
  readonly envelope: string;
}

function payloadOf<T>(row: PendingRow): T | null {
  try {
    return (JSON.parse(row.envelope) as { payload: T }).payload;
  } catch {
    return null;
  }
}

export function useRoomsData(tripId: string, me: string): RoomsData {
  const plan = useLiveRows<PlanRow>(PLAN_SQL, [tripId], ['room_plans']);
  const assignments = useLiveRows<AssignmentRow>(ASSIGN_SQL, [tripId], ['room_assignments']);
  const pending = useLiveRows<PendingRow>(PENDING_SQL, [tripId], ['commands']);
  const prefs = useLiveRows<{ chips: string | null }>(PREFS_SQL, [tripId, me], ['room_prefs']);
  const stays = useLiveRows<StayRateRow>(
    STAYS_SQL,
    [tripId],
    ['destination_cost_indices', 'trips'],
  );
  const rejected = useLiveRows<{ id: string; rejected_at: string }>(
    REJECTED_SQL,
    [],
    ['rejected_commands'],
  );
  const moves = pending.rows
    .filter((row) => row.cmd === 'set_room_assignment')
    .map((row) => payloadOf<PendingRooms>(row))
    .filter((payload): payload is PendingRooms => payload !== null);
  const queuedPrefs = pending.rows
    .filter((row) => row.cmd === 'set_room_prefs')
    .map((row) => payloadOf<{ chips: RoomChipKey[] }>(row))
    .at(-1);
  const conflict = rejected.rows[0];
  return {
    loaded: plan.loaded && assignments.loaded && stays.loaded,
    plan: buildPlan(plan.rows[0], assignments.rows, moves),
    stays: stays.rows,
    myChips: queuedPrefs?.chips ?? parseChips(prefs.rows[0]?.chips),
    swapQueued: pending.rows.some((row) => row.cmd === 'request_room_swap'),
    conflict: conflict === undefined ? null : { id: conflict.id, at: conflict.rejected_at },
  };
}
