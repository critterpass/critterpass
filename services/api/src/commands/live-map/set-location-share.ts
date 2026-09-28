/**
 * `set_location_share` (docs/api-contracts.md §4.12): turns the caller's crew-map share on or off
 * for a trip. On needs the open crew map (`boostActive(t)`, trip days); the share ends by itself
 * at last-day midnight in the destination zone, where a `location.expire` timer announces it and
 * closes the channel. Off always works, whatever the gate, and ends the share now. Turning on
 * while already on returns the open share.
 */
import { appendDomainEvent, scheduleEvent } from '@cp/db';
import { setLocationSharePayloadSchema, type SetLocationShareResult } from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import {
  activeMeetup,
  armMeetupEtas,
  LOCATION_EXPIRE_QUEUE,
  publishLiveMap,
  requireCrewMapOpen,
  requireTripParticipant,
  tripZone,
  firstRow,
} from './shared';

interface OpenShare {
  id: string;
  ends_at: Date | null;
}

async function openShare(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<OpenShare | null> {
  const { rows } = await tx.query<OpenShare>(
    `SELECT id, ends_at FROM location_shares
      WHERE trip_id = $1 AND user_id = $2 AND reason = 'crew_map'
        AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY starts_at DESC LIMIT 1`,
    [tripId, uid],
  );
  return rows[0] ?? null;
}

export const setLocationShareCommand = defineCommand({
  name: 'set_location_share',
  v: 1,
  schema: setLocationSharePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  entitle: async (tx, payload, ctx) => {
    if (payload.status === 'on') {
      await requireCrewMapOpen(tx, payload.trip_id, ctx.uid, ctx.device.tz);
    }
  },
  handle: async (tx, payload, ctx): Promise<SetLocationShareResult> => {
    const existing = await openShare(tx, payload.trip_id, ctx.uid);
    const announce = (shareId: string, change: 'on' | 'off') =>
      appendDomainEvent(tx, {
        type: 'location_share.changed',
        aggregateKind: 'location_share',
        aggregateId: shareId,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id, share_id: shareId, user_id: ctx.uid, change },
      });

    if (payload.status === 'off') {
      if (existing === null) return { share_id: null, status: 'off', ends_at: null };
      await tx.query(
        `UPDATE location_shares SET ends_at = greatest(now(), starts_at + interval '1 millisecond')
          WHERE id = $1`,
        [existing.id],
      );
      await publishLiveMap(tx, payload.trip_id, 'share.ended', {
        uid: ctx.uid,
        share_id: existing.id,
        reason: 'turned_off',
      });
      await announce(existing.id, 'off');
      return { share_id: existing.id, status: 'off', ends_at: new Date().toISOString() };
    }

    if (existing !== null) {
      return {
        share_id: existing.id,
        status: 'on',
        ends_at: existing.ends_at?.toISOString() ?? null,
      };
    }
    const { rows } = await tx.query<{ id: string; ends_at: Date }>(
      `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
       VALUES ($1, $2, 'crew_map', now(), app.crew_map_window_end($1))
       RETURNING id, ends_at`,
      [payload.trip_id, ctx.uid],
    );
    const share = firstRow(rows, 'share insert');
    const tz = await tripZone(tx, payload.trip_id);
    await scheduleEvent(tx, {
      kind: LOCATION_EXPIRE_QUEUE,
      refId: share.id,
      tz,
      at: share.ends_at,
    });
    await publishLiveMap(tx, payload.trip_id, 'share.started', {
      uid: ctx.uid,
      share_id: share.id,
      ends_at: share.ends_at.toISOString(),
    });
    await announce(share.id, 'on');
    const meetup = await activeMeetup(tx, payload.trip_id);
    if (meetup !== null) await armMeetupEtas(tx, meetup.id, tz);
    return { share_id: share.id, status: 'on', ends_at: share.ends_at.toISOString() };
  },
});
