/**
 * `pause_location_share` (docs/api-contracts.md §4.12): pauses or resumes the caller's own open
 * crew-map share. Pausing always works and takes effect at once: `POST /v1/loc` refuses the next
 * fix, viewers drop the pin on `share.paused`, and the live snapshot leaves the member out, so a
 * reconnecting viewer never sees the last fix. Resuming needs the open crew map again.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  pauseLocationSharePayloadSchema,
  type PauseLocationShareResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  activeMeetup,
  armMeetupEtas,
  firstRow,
  publishLiveMap,
  requireCrewMapOpen,
  tripZone,
} from './shared';

export const pauseLocationShareCommand = defineCommand({
  name: 'pause_location_share',
  v: 1,
  schema: pauseLocationSharePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ open: boolean }>(
      `SELECT starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) AS open
         FROM location_shares WHERE id = $1 AND user_id = $2 AND reason = 'crew_map'`,
      [payload.share_id, ctx.uid],
    );
    if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'share' });
    if (!rows[0].open) throw new DomainError('STATE_INVALID', { reason: 'share_ended' });
  },
  entitle: async (tx, payload, ctx) => {
    if (payload.paused) return;
    const { rows } = await tx.query<{ trip_id: string }>(
      'SELECT trip_id FROM location_shares WHERE id = $1',
      [payload.share_id],
    );
    await requireCrewMapOpen(tx, firstRow(rows, 'share').trip_id, ctx.uid, ctx.device.tz);
  },
  handle: async (tx, payload, ctx): Promise<PauseLocationShareResult> => {
    const { rows } = await tx.query<{ trip_id: string; was: boolean }>(
      `UPDATE location_shares s SET paused = $2
         FROM (SELECT id, paused AS was FROM location_shares WHERE id = $1) old
        WHERE s.id = old.id
        RETURNING s.trip_id, old.was`,
      [payload.share_id, payload.paused],
    );
    const row = firstRow(rows, 'share');
    if (row.was === payload.paused) return { share_id: payload.share_id, paused: payload.paused };
    if (payload.paused) {
      await publishLiveMap(tx, row.trip_id, 'share.paused', {
        uid: ctx.uid,
        share_id: payload.share_id,
        at: ctx.clock.serverNow.toISOString(),
      });
    } else {
      await publishLiveMap(tx, row.trip_id, 'share.resumed', {
        uid: ctx.uid,
        share_id: payload.share_id,
      });
      const meetup = await activeMeetup(tx, row.trip_id);
      if (meetup !== null) await armMeetupEtas(tx, meetup.id, await tripZone(tx, row.trip_id));
    }
    await appendDomainEvent(tx, {
      type: 'location_share.changed',
      aggregateKind: 'location_share',
      aggregateId: payload.share_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: row.trip_id,
      payload: {
        trip_id: row.trip_id,
        share_id: payload.share_id,
        user_id: ctx.uid,
        change: payload.paused ? 'paused' : 'resumed',
      },
    });
    return { share_id: payload.share_id, paused: payload.paused };
  },
});
