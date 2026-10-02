/**
 * The widget snapshot's per-day and money sections for one viewer, read in their own `withUser`
 * transaction: the day's briefing, plan, packing and forecast (Today), and their own net balance
 * with the crewmate they may nudge about it (Balances: a first name only).
 */
import {
  nudgeAvailableAt,
  weatherSnapshotBodySchema,
  WIDGET_TODAY_PACKING_MAX,
  WIDGET_TODAY_PLAN_MAX,
  widgetFirstName,
  widgetForecast,
} from '@cp/domain';
import type pg from 'pg';

import type { Trip } from './snapshot-data';

export async function loadToday(tx: pg.PoolClient, uid: string, trip: Trip, now: Date) {
  const tz = trip.tz ?? 'UTC';
  const localDate = now.toLocaleDateString('en-CA', { timeZone: tz });
  const briefing = await tx.query<{
    id: string;
    icon: string;
    text: string;
    action: string;
    status: string;
    deep_link: string | null;
  }>(
    `SELECT i.id, i.icon, i.text, i.action, i.status, i.deep_link
       FROM briefings b JOIN briefing_items i ON i.briefing_id = b.id
      WHERE b.trip_id = $1 AND b.user_id = $2 AND b.local_date = $3::date
      ORDER BY i.position LIMIT 6`,
    [trip.id, uid, localDate],
  );
  // The day's plan in the trip's zone, as the viewer attends it.
  const plan = await tx.query<{ id: string; starts_at: Date; title: string }>(
    `SELECT i.id, i.starts_at,
            left(coalesce(p.name, i.notes, initcap(i.category), 'Plan'), 60) AS title
       FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
       LEFT JOIN pois p ON p.id = i.poi_id
      WHERE t.id = $1 AND i.starts_at IS NOT NULL
        AND (i.starts_at AT TIME ZONE $3)::date = $4::date
        AND (i.attendee_ids IS NULL OR cardinality(i.attendee_ids) = 0 OR $2 = ANY (i.attendee_ids))
      ORDER BY i.starts_at LIMIT ${WIDGET_TODAY_PLAN_MAX}`,
    [trip.id, uid, tz, localDate],
  );
  const packing = await tx.query<{ id: string; label: string; checked: boolean }>(
    `SELECT id, left(label, 60) AS label, checked FROM packing_items
      WHERE trip_id = $1 AND deleted_at IS NULL AND (owner_id IS NULL OR owner_id = $2)
        AND (day IS NULL OR day = $3::date)
      ORDER BY checked, day NULLS LAST, created_at LIMIT ${WIDGET_TODAY_PACKING_MAX}`,
    [trip.id, uid, localDate],
  );
  const forecast = await loadForecast(tx, trip.id, localDate, now);
  if (briefing.rows.length === 0 && plan.rows.length === 0 && packing.rows.length === 0) {
    return null;
  }
  return {
    local_date: localDate,
    items: briefing.rows,
    plan: plan.rows.map((row) => ({ ...row, starts_at: row.starts_at.toISOString() })),
    packing: packing.rows,
    forecast,
  };
}

/** The rest of the day's weather at the trip's destination, from the stored snapshot. */
async function loadForecast(tx: pg.PoolClient, tripId: string, localDate: string, now: Date) {
  const { rows } = await tx.query<{ hourly: unknown }>(
    `SELECT w.hourly FROM weather_snapshots w JOIN trips t ON t.destination_id = w.destination_id
      WHERE t.id = $1 AND w.date = $2::date ORDER BY w.point_key LIMIT 1`,
    [tripId, localDate],
  );
  const body = weatherSnapshotBodySchema.safeParse(rows[0]?.hourly);
  return body.success ? widgetForecast(body.data.hours, now) : null;
}

export async function loadBalance(tx: pg.PoolClient, uid: string, tripId: string, now: Date) {
  const { rows } = await tx.query<{ currency: string; net: string }>(
    `SELECT l.currency, sum(CASE WHEN l.creditor_id = $2 THEN l.amount_minor
                                 ELSE -l.amount_minor END)::text AS net
       FROM ledger_entries l
       JOIN trips t ON t.id = l.trip_id
       LEFT JOIN crews c ON c.id = t.crew_id
      WHERE l.trip_id = $1 AND $2 IN (l.creditor_id, l.debtor_id)
      GROUP BY l.currency, c.settlement_currency
      ORDER BY (l.currency = c.settlement_currency) DESC NULLS LAST, count(*) DESC
      LIMIT 1`,
    [tripId, uid],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const net = Number(row.net);
  return {
    currency: row.currency,
    net_minor: net,
    nudge: net > 0 ? await loadNudgeTarget(tx, uid, tripId, row.currency, now) : null,
  };
}

/** The crewmate who owes the viewer most in that currency, and when a nudge may next go. */
async function loadNudgeTarget(
  tx: pg.PoolClient,
  uid: string,
  tripId: string,
  currency: string,
  now: Date,
) {
  const { rows } = await tx.query<{ user_id: string; name: string | null; last: Date | null }>(
    `SELECT o.user_id, u.display_name AS name,
            (SELECT max(n.created_at) FROM nudges n
              WHERE n.sender_id = $2 AND n.target_id = o.user_id) AS last
       FROM (SELECT CASE WHEN l.creditor_id = $2 THEN l.debtor_id ELSE l.creditor_id END AS user_id,
                    sum(CASE WHEN l.creditor_id = $2 THEN l.amount_minor
                             ELSE -l.amount_minor END) AS owed
               FROM ledger_entries l
              WHERE l.trip_id = $1 AND l.currency = $3 AND $2 IN (l.creditor_id, l.debtor_id)
              GROUP BY 1) o
       LEFT JOIN users u ON u.id = o.user_id
      WHERE o.owed > 0
      ORDER BY o.owed DESC, o.user_id LIMIT 1`,
    [tripId, uid, currency],
  );
  const target = rows[0];
  if (target === undefined) return null;
  return {
    user_id: target.user_id,
    first_name: widgetFirstName(target.name) ?? '?',
    available_at: nudgeAvailableAt(target.last, now)?.toISOString() ?? null,
  };
}
