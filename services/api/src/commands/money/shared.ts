/**
 * What the money commands share: the trip and its crew's settlement currency as the caller sees
 * them (RLS decides what exists), who takes part in the trip's money (its participants who have not
 * said no and are still in the crew), the expense edit rule (creator, payer or an organiser), and
 * the realtime hints on `crew_money:{crew_id}` (ids only).
 */
import { outbox } from '@cp/db';
import { channelName, DomainError, type MONEY_RT } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

export interface MoneyTrip {
  readonly id: string;
  readonly crew_id: string;
  readonly crew_currency: string;
  readonly tz: string | null;
  readonly start_date: string | null;
}

/**
 * The crew's settlement currency, written now if it has none yet (a crew started before any member
 * had a home): its members' most common home currency, else USD. Money is only ever recorded in a
 * written currency, so a member joining later never changes what earlier entries are in.
 */
export async function settleCrewCurrency(tx: pg.PoolClient, crewId: string): Promise<string> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ currency: string }>(
      `UPDATE crews
          SET settlement_currency = coalesce(settlement_currency, app.crew_home_currency(id), 'USD')
        WHERE id = $1
        RETURNING settlement_currency AS currency`,
      [crewId],
    ),
  );
  const currency = rows[0]?.currency;
  if (currency === undefined) throw new DomainError('NOT_FOUND', { reason: 'crew' });
  return currency;
}

/** The trip as the caller sees it, with its crew's settlement currency (settled on first use). */
export async function loadMoneyTrip(tx: pg.PoolClient, tripId: string): Promise<MoneyTrip> {
  const { rows } = await tx.query<
    Omit<MoneyTrip, 'crew_currency'> & { crew_currency: string | null }
  >(
    `SELECT t.id, t.crew_id, c.settlement_currency AS crew_currency,
            coalesce(t.tz, d.tz) AS tz, t.start_date::text AS start_date
       FROM trips t JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const crewCurrency = trip.crew_currency ?? (await settleCrewCurrency(tx, trip.crew_id));
  return { ...trip, crew_currency: crewCurrency };
}

/** Everyone the trip's money is between: participants not out, still active in the crew. */
export async function tripMoneyMembers(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT tp.user_id FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = tp.user_id AND m.status = 'active'
      WHERE tp.trip_id = $1 AND tp.rsvp <> 'out'
      ORDER BY tp.created_at, tp.user_id`,
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

/** The caller takes part in the trip's money; anyone else sees `NOT_FOUND` or `NOT_ELIGIBLE`. */
export async function requireMoneyMember(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<MoneyTrip> {
  const trip = await loadMoneyTrip(tx, tripId);
  if (!(await tripMoneyMembers(tx, tripId)).includes(uid)) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_trip' });
  }
  return trip;
}

/** Every named member must take part in the trip's money. */
export function requireAllInTrip(members: readonly string[], named: readonly string[]): void {
  const missing = named.filter((uid) => !members.includes(uid));
  if (missing.length > 0) {
    throw new DomainError('VALIDATION', { reason: 'not_in_trip', user_ids: missing });
  }
}

export async function isTripOrganiser(tx: pg.PoolClient, tripId: string): Promise<boolean> {
  const { rows } = await tx.query<{ organiser: boolean }>(
    'SELECT app.is_trip_organiser($1) AS organiser',
    [tripId],
  );
  return rows[0]?.organiser === true;
}

/** Whoever created or paid an expense may change it, and so may any of the trip's organisers. */
export async function requireExpenseEditor(
  tx: pg.PoolClient,
  expense: { readonly trip_id: string; readonly created_by: string; readonly payer_id: string },
  uid: string,
): Promise<void> {
  if (expense.created_by === uid || expense.payer_id === uid) return;
  if (await isTripOrganiser(tx, expense.trip_id)) return;
  throw new DomainError('FORBIDDEN', { reason: 'not_creator_or_payer' });
}

export function publishMoney(
  tx: pg.PoolClient,
  crewId: string,
  type: (typeof MONEY_RT)[keyof typeof MONEY_RT],
  data: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  return outbox(tx, channelName('crew_money', crewId), type, data);
}

/** The calendar date `at` falls on in `tz` (UTC when the trip has none). */
export function localDateIn(tz: string | null, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Day number within the trip (1 = its first day; 0 = before it starts), when it has dates. */
export function tripDayOf(startDate: string | null, localDate: string): number | null {
  if (startDate === null) return null;
  const days = Math.round(
    (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
  return days < 0 ? 0 : days + 1;
}
