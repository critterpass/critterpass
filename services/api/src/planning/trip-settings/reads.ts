/**
 * What a trip's settings show before anyone commits (docs/api-contracts-planning.md, routes):
 * `GET /v1/trips/{id}/dates-impact?start&end` (who is free on every one of the new days, what the
 * new dates do to each booking the caller can see, and how many stops move or go back to Ideas)
 * and `GET /v1/trips/{id}/cancel-summary` (what cancelling does: refunds, money kept by a
 * supplier, the boost, the money and the chat). Trip members only, else `NOT_FOUND`; read as the
 * caller (bookings and plan days by their own rules), with only flags of who is free read as the
 * server. Deterministic, no model.
 */
import { withUser } from '@cp/db';
import {
  CANCELLABLE_TRIP_STATUSES,
  cancelTermsOf,
  datesImpactOf,
  datesImpactQuerySchema,
  DomainError,
  type CancelSummaryResult,
  type DatesImpactResult,
  type TripStatus,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { requireTripMember } from '../../plan/access';

const tripParams = z.object({ id: z.uuid() });
const MAX_RANGE_DAYS = 30;

interface BookingRow {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly starts_on: string | null;
  readonly free_cancel_until: Date | null;
  readonly price_minor: string | null;
  readonly currency: string | null;
}

const BOOKINGS_SQL = `SELECT b.id, b.type, b.title, b.free_cancel_until, b.price_minor, b.currency,
    (b.starts_at AT TIME ZONE coalesce(b.tz, t.tz, d.tz, 'UTC'))::date::text AS starts_on
  FROM bookings b JOIN trips t ON t.id = b.trip_id LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE b.trip_id = $1 AND b.deleted_at IS NULL AND b.status = 'booked'
  ORDER BY b.starts_at NULLS LAST, b.id`;

const minorOf = (value: string | null): number | null => (value === null ? null : Number(value));

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

async function datesImpact(
  tx: pg.PoolClient,
  tripId: string,
  range: { start: string; end: string },
  now: Date,
): Promise<DatesImpactResult> {
  await requireTripMember(tx, tripId);
  const length = daysBetween(range.start, range.end) + 1;
  if (length < 1 || length > MAX_RANGE_DAYS) {
    throw new DomainError('VALIDATION', { reason: 'range', max: MAX_RANGE_DAYS });
  }
  const trip = (
    await tx.query<{ start_date: string | null; end_date: string | null }>(
      'SELECT start_date::text AS start_date, end_date::text AS end_date FROM trips WHERE id = $1',
      [tripId],
    )
  ).rows[0];
  const free = await asSystemRole(tx, () =>
    tx.query<{ uid: string; free: boolean }>(
      `SELECT m.uid,
              (SELECT count(*) FROM calendar_days c
                WHERE c.user_id = m.uid AND c.state = 'free'
                  AND c.date BETWEEN $2::date AND $3::date) = $4 AS free
         FROM app.setup_member_ids($1) AS m(uid) ORDER BY m.uid`,
      [tripId, range.start, range.end, length],
    ),
  );
  const bookings = await tx.query<BookingRow>(BOOKINGS_SQL, [tripId]);
  const plan = await tx.query<{ day_no: number; stops: number }>(
    `SELECT d.day_no, count(i.id)::int AS stops
       FROM trips t JOIN plan_days d ON d.version_id = coalesce(t.current_version_id, t.draft_version_id)
       JOIN plan_items i ON i.day_id = d.id
      WHERE t.id = $1 GROUP BY d.day_no`,
    [tripId],
  );
  const shifts = trip?.start_date !== null && trip?.start_date !== range.start;
  return {
    trip_id: tripId,
    from: { start: trip?.start_date ?? null, end: trip?.end_date ?? null },
    to: range,
    free: {
      user_ids: free.rows.filter((row) => row.free).map((row) => row.uid),
      total: free.rows.length,
    },
    bookings: bookings.rows.map((row) => {
      const impact = datesImpactOf(
        {
          startsOn: row.starts_on,
          freeCancelUntil: row.free_cancel_until?.toISOString() ?? null,
        },
        range,
        now,
      );
      return {
        booking_id: row.id,
        kind: row.type,
        title: row.title,
        starts_on: row.starts_on,
        impact,
        free_cancel_until: row.free_cancel_until?.toISOString() ?? null,
        kept_minor: impact === 'lost' ? minorOf(row.price_minor) : null,
        currency: row.currency,
      };
    }),
    stops_to_ideas: plan.rows
      .filter((row) => row.day_no > length)
      .reduce((sum, row) => sum + row.stops, 0),
    days_moving: shifts ? plan.rows.filter((row) => row.day_no <= length).length : 0,
  };
}

async function cancelSummary(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  now: Date,
): Promise<CancelSummaryResult> {
  await requireTripMember(tx, tripId);
  const trip = (
    await tx.query<{ status: TripStatus; told: number; boosted: boolean; expenses: number }>(
      `SELECT t.status,
              (SELECT count(*) FROM crew_members m
                 LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = m.user_id
                WHERE m.crew_id = t.crew_id AND m.status = 'active' AND m.user_id <> $2
                  AND coalesce(p.rsvp, '') <> 'out')::int AS told,
              EXISTS (SELECT 1 FROM trip_boosts b WHERE b.trip_id = t.id AND b.status IN ('scheduled', 'active'))
                AS boosted,
              (SELECT count(*) FROM expenses e WHERE e.trip_id = t.id AND e.deleted_at IS NULL)::int
                AS expenses
         FROM trips t WHERE t.id = $1`,
      [tripId, uid],
    )
  ).rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const bookings = await tx.query<BookingRow>(BOOKINGS_SQL, [tripId]);
  const consequences: CancelSummaryResult['consequences'][number][] = bookings.rows.map((row) => {
    const terms = cancelTermsOf(
      { freeCancelUntil: row.free_cancel_until?.toISOString() ?? null },
      now,
    );
    return {
      kind:
        terms === 'moves' ? 'booking_refund' : terms === 'lost' ? 'booking_kept' : 'booking_ask',
      booking_id: row.id,
      title: row.title,
      amount_minor: terms === 'ask' ? null : minorOf(row.price_minor),
      currency: terms === 'ask' ? null : row.currency,
      open_balances: null,
    };
  });
  const none = { booking_id: null, title: null, amount_minor: null, currency: null };
  if (trip.boosted) consequences.push({ kind: 'boost_moves', ...none, open_balances: null });
  if (trip.expenses > 0) {
    consequences.push({ kind: 'money_stays', ...none, open_balances: trip.expenses });
  }
  consequences.push({ kind: 'chat_stays', ...none, open_balances: null });
  return {
    trip_id: tripId,
    cancellable: CANCELLABLE_TRIP_STATUSES.has(trip.status),
    told_count: trip.told,
    consequences,
  };
}

export function registerTripSettingsReads(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  const read = <T>(headers: Headers, run: (tx: pg.PoolClient, uid: string) => Promise<T>) =>
    requireCommandSession(deps.sessions, headers).then((session) =>
      withUser(deps.pool, session.uid, 'unknown', (tx) => run(tx, session.uid)),
    );

  app.get('/v1/trips/:id/dates-impact', async (c) => {
    const { id } = tripParams.parse(c.req.param());
    const range = datesImpactQuerySchema.parse({
      start: c.req.query('start'),
      end: c.req.query('end'),
    });
    const body = await read(c.req.raw.headers, (tx) => datesImpact(tx, id, range, new Date()));
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.get('/v1/trips/:id/cancel-summary', async (c) => {
    const { id } = tripParams.parse(c.req.param());
    const body = await read(c.req.raw.headers, (tx, uid) => cancelSummary(tx, id, uid, new Date()));
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
