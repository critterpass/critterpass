/**
 * `move_meetup` (docs/api-contracts.md §4.12): moves the active meet-up to another place, another
 * time, or both. A new place clears the arrivals and the "everyone is close" moment; the sharing
 * crew hears the move (budgeted push) and the ETAs are recounted.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, moveMeetupPayloadSchema, type MeetupWire } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  armMeetupEtas,
  MEETUP_COLUMNS,
  meetupWire,
  publishLiveMap,
  readMeetup,
  requireCrewMapOpen,
  requireTripParticipant,
  resolvePlace,
  tripZone,
  firstRow,
} from './shared';

export const moveMeetupCommand = defineCommand({
  name: 'move_meetup',
  v: 1,
  schema: moveMeetupPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ trip_id: string }>('SELECT app.meetup_trip($1) AS trip_id', [
      payload.meetup_id,
    ]);
    const tripId = rows[0]?.trip_id;
    if (tripId === undefined || tripId === null) {
      throw new DomainError('NOT_FOUND', { reason: 'meetup' });
    }
    await requireTripParticipant(tx, tripId, ctx.uid);
  },
  entitle: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ trip_id: string }>('SELECT app.meetup_trip($1) AS trip_id', [
      payload.meetup_id,
    ]);
    await requireCrewMapOpen(tx, firstRow(rows, 'meetup').trip_id, ctx.uid, ctx.device.tz);
  },
  handle: async (tx, payload, ctx): Promise<MeetupWire> => {
    const current = await readMeetup(tx, payload.meetup_id);
    if (current === null) throw new DomainError('NOT_FOUND', { reason: 'meetup' });
    if (current.status !== 'active') {
      throw new DomainError('STATE_INVALID', { reason: 'meetup_not_active' });
    }
    const place = await resolvePlace(tx, payload);
    const { rows } = await tx.query<Parameters<typeof meetupWire>[0]>(
      `UPDATE meetups SET
         poi_id = CASE WHEN $2 THEN $3::uuid ELSE poi_id END,
         place_name = coalesce($4, place_name),
         lat = coalesce($5, lat),
         lng = coalesce($6, lng),
         meet_at = coalesce($7::timestamptz, meet_at)
       WHERE id = $1
       RETURNING ${MEETUP_COLUMNS}`,
      [
        payload.meetup_id,
        place !== null,
        place?.poiId ?? null,
        place?.name ?? null,
        place?.lat ?? null,
        place?.lng ?? null,
        payload.at ?? null,
      ],
    );
    let meetup = meetupWire(firstRow(rows, 'meetup'));
    if (place !== null) {
      // A new place: arrivals and the all-close moment start over (system-only columns).
      await tx.query('SELECT app.reset_meetup_arrivals($1)', [payload.meetup_id]);
      meetup = { ...meetup, arrived: {} };
    }
    await publishLiveMap(tx, meetup.trip_id, 'meetup.moved', { meetup });
    await appendDomainEvent(tx, {
      type: 'meetup.moved',
      aggregateKind: 'meetup',
      aggregateId: meetup.id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: meetup.trip_id,
      payload: { trip_id: meetup.trip_id, meetup_id: meetup.id, by: ctx.uid },
    });
    await armMeetupEtas(tx, meetup.id, await tripZone(tx, meetup.trip_id));
    return meetup;
  },
});
