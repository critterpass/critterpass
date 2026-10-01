/**
 * `start_help_share {trip_id, reason: help, ttl_min?, session_id?, place_label?}` (3k-6 "CREW CAN SEE
 * YOU · 1H"): opens a Help session and shares the caller's location with the trip's crew for an
 * hour. Free on every trip (Help is never gated), and it overrides a paused crew-map share (the app
 * says so). The share ends by itself: `can_see_location` stops at `ends_at`, and a timer announces
 * it. Starting while a Help share is already open answers that share.
 */
import {
  helpShareEnd,
  HELP_SHARE_TTL_MIN,
  startHelpSharePayloadSchema,
  type StartHelpShareResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  armHelpShareExpiry,
  asSystem,
  emit,
  firstRow,
  requireTripParticipant,
  tripCrew,
} from './shared';

export const startHelpShareCommand = defineCommand({
  name: 'start_help_share',
  v: 1,
  schema: startHelpSharePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<StartHelpShareResult> => {
    const now = ctx.clock.serverNow;
    const paused = await tx.query(
      `SELECT 1 FROM location_shares
        WHERE trip_id = $1 AND user_id = $2 AND reason = 'crew_map' AND paused
          AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
      [payload.trip_id, ctx.uid],
    );
    const overrodePause = (paused.rowCount ?? 0) > 0;
    const open = await tx.query<{ share_id: string; ends_at: Date; session_id: string }>(
      `SELECT l.id AS share_id, l.ends_at, s.id AS session_id
         FROM location_shares l JOIN help_sessions s ON s.share_id = l.id
        WHERE l.trip_id = $1 AND l.user_id = $2 AND l.reason = 'help'
          AND l.starts_at <= now() AND l.ends_at > now()
        ORDER BY l.starts_at DESC LIMIT 1`,
      [payload.trip_id, ctx.uid],
    );
    const current = open.rows[0];
    if (current !== undefined) {
      return {
        session_id: current.session_id,
        share_id: current.share_id,
        ends_at: current.ends_at.toISOString(),
        overrode_pause: overrodePause,
      };
    }

    const endsAt = helpShareEnd(now, payload.ttl_min ?? HELP_SHARE_TTL_MIN);
    const share = await tx.query<{ id: string }>(
      `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
       VALUES ($1, $2, 'help', $3, $4) RETURNING id`,
      [payload.trip_id, ctx.uid, now, endsAt],
    );
    const shareId = firstRow(share.rows, 'share insert').id;
    const own =
      payload.session_id === undefined
        ? []
        : (
            await tx.query<{ id: string; mine: boolean }>(
              `SELECT id, user_id = $2 AND kind = 'help' AS mine FROM help_sessions WHERE id = $1`,
              [payload.session_id, ctx.uid],
            )
          ).rows;
    const reopen = own.find((row) => row.mine)?.id;
    let sessionId: string;
    if (reopen !== undefined) {
      sessionId = reopen;
      await asSystem(
        tx,
        `UPDATE help_sessions SET share_id = $2, status = 'open', resolved_at = NULL,
                resolved_by = NULL, place_label = coalesce($3, place_label)
          WHERE id = $1`,
        [sessionId, shareId, payload.place_label ?? null],
      );
    } else {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO help_sessions (id, trip_id, user_id, kind, share_id, place_label, opened_at)
         VALUES (coalesce($1::uuid, uuidv7()), $2, $3, 'help', $4, $5, $6) RETURNING id`,
        [
          own.length === 0 ? (payload.session_id ?? null) : null,
          payload.trip_id,
          ctx.uid,
          shareId,
          payload.place_label ?? null,
          now,
        ],
      );
      sessionId = firstRow(inserted.rows, 'session insert').id;
    }
    await armHelpShareExpiry(tx, shareId, endsAt);
    await emit(tx, {
      type: 'help_share.started',
      aggregateKind: 'help_session',
      aggregateId: sessionId,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: await tripCrew(tx, payload.trip_id),
      tripId: payload.trip_id,
      payload: {
        trip_id: payload.trip_id,
        share_id: shareId,
        session_id: sessionId,
        ends_at: endsAt.toISOString(),
      },
    });
    return {
      session_id: sessionId,
      share_id: shareId,
      ends_at: endsAt.toISOString(),
      overrode_pause: overrodePause,
    };
  },
});
