/**
 * What the setup commands share: the trip as the caller sees it (RLS decides it exists), who takes
 * part in setup (`app.setup_member_ids`: the crew, less anyone who said no), the organiser check,
 * realtime hints on `trip_setup:{trip_id}` (ids, enums and counts only), and the per-trip
 * recomputes the commands queue.
 */
import { outbox, sendInTx } from '@cp/db';
import {
  channelName,
  DomainError,
  SETUP_INPUT_STATUSES,
  SETUP_QUEUES,
  type TripSetupStep,
  type TripStatus,
} from '@cp/domain';
import type pg from 'pg';

export interface SetupTrip {
  readonly id: string;
  readonly crew_id: string;
  readonly status: TripStatus;
  readonly setup_step: TripSetupStep;
  readonly is_solo: boolean;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly trip_length_days: number | null;
  readonly tz: string | null;
  readonly currency: string | null;
  readonly destination_id: string | null;
}

/**
 * Trip states in which the organiser still moves setup on (dates, budget target, rooms): before
 * the guide drafts, and while she reviews the draft; never while the guide is at work on it.
 */
export const SETUP_OPEN_STATUSES: readonly TripStatus[] = ['won', 'setup', 'draft_review'];
/** Members' own part (days, max, sleep, way there) and must-dos keep coming until the proposal. */
export const MEMBER_INPUT_STATUSES: readonly TripStatus[] = SETUP_INPUT_STATUSES;
export const MUST_DO_OPEN_STATUSES: readonly TripStatus[] = SETUP_INPUT_STATUSES;

/** The trip as the caller sees it, or `NOT_FOUND`; `lock` takes the row lock as the server. */
export async function loadSetupTrip(
  tx: pg.PoolClient,
  tripId: string,
  lock = false,
): Promise<SetupTrip> {
  const { rows } = await tx.query<SetupTrip>(
    `SELECT t.id, t.crew_id, t.status, t.setup_step, t.is_solo, t.start_date::text AS start_date,
            t.end_date::text AS end_date, t.trip_length_days,
            coalesce(t.tz, d.tz) AS tz, coalesce(t.local_currency, d.currency) AS currency,
            t.destination_id
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 ${lock ? 'FOR UPDATE OF t' : ''}`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip;
}

export function requireStatus(trip: SetupTrip, allowed: readonly TripStatus[]): void {
  if (!allowed.includes(trip.status)) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: trip.status });
  }
}

export async function setupMemberIds(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ uid: string }>(
    'SELECT uid FROM app.setup_member_ids($1) AS m(uid) ORDER BY uid',
    [tripId],
  );
  return rows.map((row) => row.uid);
}

/** The caller takes part in this trip's setup (a crew member who has not said no). */
export async function requireSetupMember(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<SetupTrip> {
  const trip = await loadSetupTrip(tx, tripId);
  if (!(await setupMemberIds(tx, tripId)).includes(uid)) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_setup' });
  }
  return trip;
}

export async function requireOrganiser(tx: pg.PoolClient, tripId: string): Promise<SetupTrip> {
  const trip = await loadSetupTrip(tx, tripId);
  const { rows } = await tx.query<{ organiser: boolean }>(
    'SELECT app.is_trip_organiser($1) AS organiser',
    [tripId],
  );
  if (rows[0]?.organiser !== true) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  return trip;
}

export function setupChannel(tripId: string): string {
  return channelName('trip_setup', tripId);
}

export function publishSetup(
  tx: pg.PoolClient,
  tripId: string,
  type: string,
  data: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  return outbox(tx, setupChannel(tripId), type, data);
}

/** Queues one availability recount + window recompute for the trip (one queued per trip). */
export function queueWindowRecompute(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  return sendInTx(tx, SETUP_QUEUES.windowRecompute, { trip_id: tripId }, { singletonKey: tripId });
}

/**
 * Queues the budget recompute check; the job decides whether the debounce has run out. `force`
 * recomputes at once (a member left: the minimum-k check cannot wait).
 */
export function queueBudgetRecompute(
  tx: pg.PoolClient,
  tripId: string,
  force = false,
): Promise<string | null> {
  return sendInTx(
    tx,
    SETUP_QUEUES.budgetRecompute,
    { trip_id: tripId, force },
    { singletonKey: tripId },
  );
}

/** Trips the member is setting up now (their days feed each one's windows). */
export async function openSetupTripIds(tx: pg.PoolClient, uid: string): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT t.id FROM trips t
       JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = $1 AND m.status = 'active'
      WHERE t.status = ANY ($2::text[])
        AND $1 IN (SELECT app.setup_member_ids(t.id))
      ORDER BY t.id`,
    [uid, SETUP_INPUT_STATUSES],
  );
  return rows.map((row) => row.id);
}

/**
 * Refreshes whether each setup member's days and max are in (flags only) and answers how many
 * members' flags changed. Runs as the server.
 */
export async function refreshMemberSetup(tx: pg.PoolClient, tripId: string): Promise<number> {
  const { rows } = await tx.query<{ changed: number }>(
    'SELECT app.recompute_member_setup($1) AS changed',
    [tripId],
  );
  return rows[0]?.changed ?? 0;
}

/** Today's date in `tz` (the trip's zone; UTC when it has none). */
export function todayIn(tz: string | null, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}
