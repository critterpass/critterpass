/**
 * Everything the hub reads, as live local queries (so it renders offline): the trip, who is going,
 * the plan's size and open votes, bookings, the ledger, my flights, today's next item, the latest
 * briefing and the activity ticker. The `trip` channel's activity events refresh the ticker the
 * moment they land, before their rows sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';

import {
  BRIEFING_ITEMS_SQL,
  BRIEFING_SQL,
  PENDING_ACTS_SQL,
  type BriefingItemRow,
  type BriefingRead,
  type BriefingRow,
  type PendingAct,
} from '../../briefing/briefing-model';
import type { LeaveByRow } from '../../leave-by/model';
import { shownStop, useReadsLocalNames } from '@/data/places/use-shown-names';

import type { LedgerRow } from '../hub-model';
import { useLiveRows } from './live-rows';
import {
  GOING_SQL,
  GOING_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type MemberRow,
  type TripRow,
} from './queries';

const DAYS_SQL = `SELECT count(*) AS n FROM plan_days WHERE version_id = ?`;
const VOTES_SQL = `SELECT id, stage FROM polls WHERE trip_id = ? AND status = 'open'
  ORDER BY created_at`;
const BOOKINGS_SQL = `SELECT count(*) AS n FROM bookings
  WHERE trip_id = ? AND deleted_at IS NULL AND status <> 'cancelled'`;
const LEDGER_SQL = `SELECT debtor_id, creditor_id, amount_minor, currency FROM ledger_entries
  WHERE trip_id = ?`;
const FLIGHTS_SQL = `SELECT id, title, starts_at, ends_at FROM bookings
  WHERE trip_id = ? AND type = 'flight' AND deleted_at IS NULL AND status <> 'cancelled'
    AND (owner_id = ? OR traveller_ids LIKE '%' || ? || '%')
  ORDER BY starts_at`;
const NEXT_ITEM_SQL = `SELECT i.stable_id, i.starts_at, i.tz, i.notes, i.category, p.name AS poi_name,
    p.name_local AS poi_name_local, d.date AS day_date
  FROM plan_items i JOIN plan_days d ON d.id = i.day_id LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.version_id = ? AND julianday(i.starts_at) > julianday(?)
  ORDER BY i.starts_at LIMIT 1`;
const TODAY_LEAVE_BY_SQL = `SELECT id, trip_id, plan_item_id, title, place_name, local_date,
    starts_at, leave_at, pickup_at, tz, legs, alarm_policy, pickup, buffer_min, guide_note,
    participant_ids, state FROM leave_bys
  WHERE trip_id = ? AND local_date = ? AND state NOT IN ('cancelled', 'departed')
  ORDER BY leave_at LIMIT 1`;
const ACTIVITY_SQL = `SELECT a.id, a.actor_id, a.verb, a.object_kind, a.object_id, a.text, a.at,
    u.display_name AS actor_name
  FROM activity_events a LEFT JOIN users u ON u.id = a.actor_id
  WHERE a.trip_id = ? AND ? >= 0 ORDER BY a.at DESC LIMIT 12`;

export interface ActivityRow {
  readonly id: string;
  readonly actor_id: string | null;
  readonly verb: string;
  readonly object_kind: string;
  readonly object_id: string | null;
  readonly text: string | null;
  readonly at: string;
  readonly actor_name: string | null;
}

/** An open poll on the trip and its stage (`board` while pitching, `final` for the last two). */
export interface OpenVote {
  readonly id: string;
  readonly stage: string | null;
}

export interface HubRows {
  readonly loaded: boolean;
  readonly trip: TripRow | null;
  readonly members: readonly MemberRow[];
  readonly going: number;
  readonly days: number;
  readonly openVotes: readonly OpenVote[];
  readonly bookings: number;
  readonly ledger: readonly LedgerRow[];
  readonly flights: readonly {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
  }[];
  readonly next: {
    stable_id: string;
    starts_at: string;
    tz: string | null;
    notes: string | null;
    category: string | null;
    poi_name: string | null;
    day_date: string;
  } | null;
  readonly leaveBy: LeaveByRow | null;
  /** The briefing's first local read (the row, then its lines). */
  readonly briefingRead: BriefingRead;
  readonly briefing: BriefingRow | null;
  readonly briefingItems: readonly BriefingItemRow[];
  readonly pendingActs: readonly PendingAct[];
  readonly activity: readonly ActivityRow[];
}

export function useHubRows(
  tripId: string,
  me: string | null,
  today: string,
  minuteIso: string,
): HubRows {
  const trip = useLiveRows<TripRow>(TRIP_SQL, me === null ? null : [me, tripId], TRIP_TABLES);
  const row = trip.rows[0] ?? null;
  const members = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    row === null ? null : [row.crew_id],
    MEMBERS_TABLES,
  );
  const going = useLiveRows<{ user_id: string }>(GOING_SQL, [tripId], GOING_TABLES);
  const version = row?.current_version_id ?? null;
  const days = useLiveRows<{ n: number }>(DAYS_SQL, version === null ? null : [version], [
    'plan_days',
  ]);
  const votes = useLiveRows<OpenVote>(VOTES_SQL, [tripId], ['polls']);
  const bookings = useLiveRows<{ n: number }>(BOOKINGS_SQL, [tripId], ['bookings']);
  const ledger = useLiveRows<LedgerRow>(LEDGER_SQL, [tripId], ['ledger_entries']);
  const flights = useLiveRows<HubRows['flights'][number]>(
    FLIGHTS_SQL,
    me === null ? null : [tripId, me, me],
    ['bookings'],
  );
  const next = useLiveRows<NonNullable<HubRows['next']>>(
    NEXT_ITEM_SQL,
    version === null ? null : [version, minuteIso],
    ['plan_items', 'plan_days', 'pois'],
  );
  const readsLocal = useReadsLocalNames(trip.rows[0]?.destination_id ?? null);
  const nextRow = next.rows[0] ?? null;
  const leaveBy = useLiveRows<NonNullable<HubRows['leaveBy']>>(
    TODAY_LEAVE_BY_SQL,
    [tripId, today],
    ['leave_bys'],
  );
  const briefing = useLiveRows<BriefingRow>(BRIEFING_SQL, me === null ? null : [tripId, me], [
    'briefings',
  ]);
  const briefingRow = briefing.rows[0] ?? null;
  const items = useLiveRows<BriefingItemRow>(
    BRIEFING_ITEMS_SQL,
    briefingRow === null ? null : [briefingRow.id],
    ['briefing_items'],
  );
  const linesRead = briefingRow === null || items.loaded;
  const briefingRead: BriefingRead =
    briefing.failed || items.failed
      ? 'failed'
      : briefing.loaded && linesRead
        ? 'settled'
        : 'pending';
  const pending = useLiveRows<PendingAct>(PENDING_ACTS_SQL, [], ['commands']);
  const [bump, setBump] = useState(0);
  const activity = useLiveRows<ActivityRow>(
    ACTIVITY_SQL,
    [tripId, bump],
    ['activity_events', 'users'],
  );
  useChannel('trip', tripId, {
    onEvent: (envelope) => {
      if (envelope.type === 'activity' || envelope.type.startsWith('activity.'))
        setBump((n) => n + 1);
    },
  });
  return useMemo(
    () => ({
      loaded: trip.loaded,
      trip: row,
      members: members.rows,
      going: going.rows.length,
      days: days.rows[0]?.n ?? 0,
      openVotes: votes.rows,
      bookings: bookings.rows[0]?.n ?? 0,
      ledger: ledger.rows,
      flights: flights.rows,
      next: nextRow === null ? null : { ...nextRow, poi_name: shownStop(nextRow, readsLocal) },
      leaveBy: leaveBy.rows[0] ?? null,
      briefingRead,
      briefing: briefingRow,
      briefingItems: items.rows,
      pendingActs: pending.rows,
      activity: activity.rows,
    }),
    [
      trip.loaded,
      row,
      members.rows,
      going.rows,
      days.rows,
      votes.rows,
      bookings.rows,
      ledger.rows,
      flights.rows,
      nextRow,
      readsLocal,
      leaveBy.rows,
      briefingRead,
      briefingRow,
      items.rows,
      pending.rows,
      activity.rows,
    ],
  );
}
