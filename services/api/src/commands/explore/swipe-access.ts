/**
 * Who may swipe (docs/product-decisions.md §7): any participant of the trip (an active member of
 * its crew who has not answered "out", or its organiser). A session is found through RLS, so a
 * non-member gets `NOT_FOUND`, never a hint that it exists.
 */
import { channelName, DomainError } from '@cp/domain';
import { outbox } from '@cp/db';
import type pg from 'pg';

export interface SwipeSessionRow {
  readonly id: string;
  readonly trip_id: string;
  readonly destination_id: string;
  readonly started_by: string;
  readonly status: 'building' | 'live' | 'ended';
  readonly match_rule: number;
  readonly deck: readonly { readonly poi_id: string }[];
}

export async function requireSwipeParticipant(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ allowed: boolean }>(
    `SELECT app.is_trip_member($1) AND (app.is_trip_organiser($1) OR EXISTS (
       SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = app.uid() AND rsvp <> 'out'
     )) AS allowed`,
    [tripId],
  );
  if (rows[0]?.allowed !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
}

/** The session as the caller sees it, after the participant check. */
export async function loadSession(tx: pg.PoolClient, sessionId: string): Promise<SwipeSessionRow> {
  const { rows } = await tx.query<SwipeSessionRow>(
    `SELECT id, trip_id, destination_id, started_by, status, match_rule, deck
       FROM swipe_sessions WHERE id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (session === undefined) throw new DomainError('NOT_FOUND', { reason: 'session' });
  await requireSwipeParticipant(tx, session.trip_id);
  return session;
}

export function publishSwipe(tx: pg.PoolClient, sessionId: string, type: string, data: unknown) {
  return outbox(tx, channelName('swipe', sessionId), type, data);
}
