/**
 * What every Help and SOS command shares: who may act (a participant of the trip, still in the
 * crew), the session row as the server sees it, step and response updates on the synced row (run as
 * app_system after the app-layer check: app_user holds no UPDATE on sessions), the realtime hints
 * on `sos:{id}` and the Help share's end-of-window timer.
 */
import { appendDomainEvent, outbox, sendInTx, type AppendedDomainEvent } from '@cp/db';
import {
  DomainError,
  HELP_SHARE_ENDING_LEAD_MIN,
  SAFETY_QUEUES,
  sosChannel,
  type DomainEventInput,
  type SosChannelType,
  type SosStepKey,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

export { requireTripParticipant } from '../live-map/shared';

export function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`safety: ${what} returned no row`);
  return row;
}

export interface SessionRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly user_id: string;
  readonly kind: 'help' | 'sos';
  readonly status: 'open' | 'responding' | 'resolved' | 'stale';
  readonly responder_ids: readonly string[];
  readonly share_id: string | null;
  readonly alerted_count: number;
}

/** The session as the server sees it (a stale SOS included), locked for this transaction. */
export async function lockSession(tx: pg.PoolClient, id: string): Promise<SessionRow | null> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<SessionRow>(
      `SELECT s.id, s.trip_id, t.crew_id, s.user_id, s.kind, s.status, s.responder_ids,
              s.share_id, s.alerted_count
         FROM help_sessions s JOIN trips t ON t.id = s.trip_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [id],
    );
    return rows[0] ?? null;
  });
}

/** The session if the caller may see it (RLS), else `NOT_FOUND`; locked for the caller's change. */
export async function requireVisibleSos(tx: pg.PoolClient, id: string): Promise<SessionRow> {
  const visible = await tx.query('SELECT 1 FROM help_sessions WHERE id = $1 AND kind = $2', [
    id,
    'sos',
  ]);
  const session = visible.rowCount === 0 ? null : await lockSession(tx, id);
  if (session === null) throw new DomainError('NOT_FOUND', { reason: 'sos' });
  return session;
}

export async function tripCrew(tx: pg.PoolClient, tripId: string): Promise<string> {
  const { rows } = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
    tripId,
  ]);
  const crew = rows[0]?.crew_id;
  if (crew === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return crew;
}

/** Runs `sql` as app_system inside the caller's transaction (the session row's writes). */
export function asSystem<T extends pg.QueryResultRow>(
  tx: pg.PoolClient,
  sql: string,
  params: readonly unknown[],
): Promise<pg.QueryResult<T>> {
  return asSystemRole(tx, () => tx.query<T>(sql, [...params]));
}

/** Merges one step into the session's `steps` card and hints it on the incident's channel. */
export async function setStep(
  tx: pg.PoolClient,
  sessionId: string,
  key: SosStepKey,
  step: { readonly state: 'pending' | 'done'; readonly n?: number },
  at: Date,
): Promise<void> {
  const value = { ...step, at: at.toISOString() };
  await asSystem(
    tx,
    `UPDATE help_sessions SET steps = steps || jsonb_build_object($2::text, $3::jsonb)
      WHERE id = $1`,
    [sessionId, key, JSON.stringify(value)],
  );
  await publishSos(tx, sessionId, 'step', { key, ...value });
}

export function publishSos(
  tx: pg.PoolClient,
  sosId: string,
  type: SosChannelType,
  data: unknown,
): Promise<unknown> {
  return outbox(tx, sosChannel(sosId), type, data);
}

export function emit(tx: pg.PoolClient, event: DomainEventInput): Promise<AppendedDomainEvent> {
  return appendDomainEvent(tx, event);
}

/**
 * Arms the Help share's end-of-window notice and, ten minutes before it, the sharer's reminder (one
 * of each per share and end, so an extend re-arms both; the job for an earlier end finds the share
 * moved on and stays silent).
 */
export async function armHelpShareExpiry(
  tx: pg.PoolClient,
  shareId: string,
  endsAt: Date,
  now: Date = new Date(),
): Promise<void> {
  const key = `${shareId}:${endsAt.toISOString()}`;
  await sendInTx(
    tx,
    SAFETY_QUEUES.helpShareExpire,
    { share_id: shareId },
    { startAfter: endsAt, singletonKey: key },
  );
  const remindAt = new Date(endsAt.getTime() - HELP_SHARE_ENDING_LEAD_MIN * 60_000);
  if (remindAt.getTime() <= now.getTime()) return;
  await sendInTx(
    tx,
    SAFETY_QUEUES.helpShareEnding,
    { share_id: shareId, ends_at: endsAt.toISOString() },
    { startAfter: remindAt, singletonKey: key },
  );
}
