/**
 * A stay expense split by room, on the phone: the rooms it follows (from the synced room plan and
 * who sleeps where) and the switches between "By room" and "Evenly". The server works out every
 * share and re-splits a by-room expense whenever the rooms change; here the shares are only read.
 * Both switches are expense edits, queued offline like any other.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { ExpenseSplitInput, PlanRoomWire } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';

import { editExpenseCommand } from './commands';
import { useLiveRows } from './live-rows';

export interface SplitRoom {
  readonly key: string;
  readonly stayKey: string;
  /** 1-based order inside its stay ("Room 2"). */
  readonly number: number;
  readonly nightlyMinor: number;
  readonly nights: number;
  readonly occupants: readonly string[];
}

const EXPENSE_SQL = `SELECT trip_id, split_mode, split_stay_key, version FROM expenses WHERE id = ?`;
const STAY_EXPENSE_SQL = `SELECT id, trip_id, split_mode, split_stay_key, version, amount_minor, currency
  FROM expenses
  WHERE trip_id = ? AND deleted_at IS NULL AND category = 'stays' AND source = 'booking'
  ORDER BY created_at DESC LIMIT 1`;
const PLAN_SQL = 'SELECT rooms FROM room_plans WHERE trip_id = ?';
const SEATS_SQL = `SELECT stay_key, room_key, user_id FROM room_assignments
  WHERE trip_id = ? ORDER BY user_id`;

interface ExpenseSplitRow {
  readonly id?: string;
  readonly trip_id: string;
  readonly split_mode: string;
  readonly split_stay_key: string | null;
  readonly version: number;
  readonly amount_minor?: number;
  readonly currency?: string;
}

function parseRooms(value: string | null | undefined): PlanRoomWire[] {
  if (value == null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PlanRoomWire[]) : [];
  } catch {
    return [];
  }
}

function useSplitRooms(tripId: string | null, stayKey: string | null): SplitRoom[] {
  const plan = useLiveRows<{ rooms: string | null }>(PLAN_SQL, tripId === null ? null : [tripId], [
    'room_plans',
  ]);
  const seats = useLiveRows<{ stay_key: string; room_key: string; user_id: string }>(
    SEATS_SQL,
    tripId === null ? null : [tripId],
    ['room_assignments'],
  );
  const counters = new Map<string, number>();
  return parseRooms(plan.rows[0]?.rooms)
    .filter((room) => stayKey === null || room.stay_key === stayKey)
    .map((room) => {
      const number = (counters.get(room.stay_key) ?? 0) + 1;
      counters.set(room.stay_key, number);
      return {
        key: room.key,
        stayKey: room.stay_key,
        number,
        nightlyMinor: room.nightly_minor,
        nights: room.stay_nights,
        occupants: seats.rows
          .filter((seat) => seat.stay_key === room.stay_key && seat.room_key === room.key)
          .map((seat) => seat.user_id),
      };
    });
}

function useSplitSwitch(row: ExpenseSplitRow | undefined, expenseId: string | null) {
  const edit = useCommand(editExpenseCommand);
  const send = (split: ExpenseSplitInput) => {
    if (expenseId === null || row === undefined) return;
    void edit.send({ expense_id: expenseId, patch: { split } }, { baseVersion: row.version });
  };
  return {
    pending: edit.pending,
    /** Split the stay by the room plan (one stay of it, or all when the plan has one). */
    splitByRoom: (stayKey: string | null) => send({ mode: 'by_room', stay_key: stayKey }),
    /** Split it evenly between `userIds`; it stops following the rooms. */
    splitEvenly: (userIds: readonly string[]) => {
      if (userIds.length === 0) return;
      send({ mode: 'equal', shares: userIds.map((user_id) => ({ user_id })) });
    },
  };
}

/** One expense's by-room view (7.22): null rooms unless it is split by room. */
export function useRoomSplit(expenseId: string) {
  const row = useLiveRows<ExpenseSplitRow>(EXPENSE_SQL, [expenseId], ['expenses']).rows[0];
  const byRoom = row?.split_mode === 'by_room';
  const rooms = useSplitRooms(byRoom ? (row?.trip_id ?? null) : null, row?.split_stay_key ?? null);
  return { byRoom, rooms: byRoom ? rooms : [], ...useSplitSwitch(row, expenseId) };
}

export type StaySplitMode = 'by_room' | 'evenly';

/** The trip's booked stay expense and how it splits, for the rooms editor's By room | Evenly. */
export function useStayRoomSplit(tripId: string) {
  const row = useLiveRows<ExpenseSplitRow>(STAY_EXPENSE_SQL, [tripId], ['expenses']).rows[0];
  const rooms = useSplitRooms(row === undefined ? null : tripId, null);
  const mode: StaySplitMode = row?.split_mode === 'by_room' ? 'by_room' : 'evenly';
  return {
    expense:
      row?.id === undefined
        ? null
        : {
            id: row.id,
            amountMinor: row.amount_minor ?? 0,
            currency: row.currency ?? '',
            mode,
          },
    guests: [...new Set(rooms.flatMap((room) => room.occupants))],
    ...useSplitSwitch(row, row?.id ?? null),
  };
}
