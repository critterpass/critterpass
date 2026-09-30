/**
 * `undo_swipe` and `end_swipe_session` (docs/api-contracts-explore.md): a participant takes back
 * their last verdict on a card (a match already made stays: it was arbitrated once), and the
 * session's starter or an organiser ends the session for everyone.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  endSwipeSessionPayloadSchema,
  SWIPE_RT,
  undoSwipePayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadSession, publishSwipe } from './swipe-access';

export const undoSwipeCommand = defineCommand({
  name: 'undo_swipe',
  v: 1,
  schema: undoSwipePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const session = await loadSession(tx, payload.session_id);
    if (session.status === 'ended') {
      throw new DomainError('STATE_INVALID', { reason: 'session_ended' });
    }
  },
  handle: async (
    tx,
    payload,
    ctx,
  ): Promise<{ session_id: string; place_id: string; undone: boolean }> => {
    const session = await loadSession(tx, payload.session_id);
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `swipe:${session.id}:${payload.place_id}`,
    ]);
    const removed = await asSystemRole(tx, () =>
      tx.query('DELETE FROM swipe_votes WHERE session_id = $1 AND user_id = $2 AND poi_id = $3', [
        session.id,
        ctx.uid,
        payload.place_id,
      ]),
    );
    const undone = (removed.rowCount ?? 0) > 0;
    if (undone) {
      await appendDomainEvent(tx, {
        type: 'swipe.undone',
        aggregateKind: 'swipe_session',
        aggregateId: session.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: session.trip_id,
        payload: {
          trip_id: session.trip_id,
          session_id: session.id,
          poi_id: payload.place_id,
          user_id: ctx.uid,
        },
      });
      await publishSwipe(tx, session.id, SWIPE_RT.vote, {
        uid: ctx.uid,
        poi_id: payload.place_id,
        undone: true,
      });
    }
    return { session_id: session.id, place_id: payload.place_id, undone };
  },
});

export const endSwipeSessionCommand = defineCommand({
  name: 'end_swipe_session',
  v: 1,
  schema: endSwipeSessionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const session = await loadSession(tx, payload.session_id);
    const { rows } = await tx.query<{ organiser: boolean }>(
      'SELECT app.is_trip_organiser($1) AS organiser',
      [session.trip_id],
    );
    if (session.started_by !== ctx.uid && rows[0]?.organiser !== true) {
      throw new DomainError('FORBIDDEN', { reason: 'starter_or_organiser' });
    }
  },
  handle: async (tx, payload, ctx): Promise<{ session_id: string; status: 'ended' }> => {
    const session = await loadSession(tx, payload.session_id);
    if (session.status === 'ended') return { session_id: session.id, status: 'ended' };
    await asSystemRole(tx, () =>
      tx.query("UPDATE swipe_sessions SET status = 'ended', ended_at = now() WHERE id = $1", [
        session.id,
      ]),
    );
    await appendDomainEvent(tx, {
      type: 'swipe.ended',
      aggregateKind: 'swipe_session',
      aggregateId: session.id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: session.trip_id,
      payload: { trip_id: session.trip_id, session_id: session.id },
    });
    await publishSwipe(tx, session.id, SWIPE_RT.ended, { by: ctx.uid });
    return { session_id: session.id, status: 'ended' };
  },
});
