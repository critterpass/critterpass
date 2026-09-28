/**
 * `create_meetup` (docs/api-contracts.md §4.12): sets the trip's meet-up (a catalogue place or a
 * dropped pin, and a time). One active meet-up per trip; the client may choose the id, so an
 * offline create replays onto the same row. The crew hears it on the channel and as a budgeted
 * push, and the ETA recount starts.
 */
import { appendDomainEvent } from '@cp/db';
import { createMeetupPayloadSchema, DomainError, type MeetupWire } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  activeMeetup,
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

export const createMeetupCommand = defineCommand({
  name: 'create_meetup',
  v: 1,
  schema: createMeetupPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  entitle: (tx, payload, ctx) => requireCrewMapOpen(tx, payload.trip_id, ctx.uid, ctx.device.tz),
  handle: async (tx, payload, ctx): Promise<MeetupWire> => {
    if (payload.meetup_id !== undefined) {
      const replay = await readMeetup(tx, payload.meetup_id);
      if (replay !== null) {
        if (replay.trip_id !== payload.trip_id) {
          throw new DomainError('VALIDATION', { reason: 'meetup_id_taken' });
        }
        return replay;
      }
    }
    const current = await activeMeetup(tx, payload.trip_id);
    if (current !== null) {
      throw new DomainError('STATE_INVALID', { reason: 'meetup_exists', meetup_id: current.id });
    }
    const place = await resolvePlace(tx, payload);
    if (place === null) throw new DomainError('VALIDATION', { reason: 'place_required' });
    const { rows } = await tx.query<Parameters<typeof meetupWire>[0]>(
      `INSERT INTO meetups (id, trip_id, poi_id, place_name, lat, lng, meet_at, created_by)
       VALUES (coalesce($1::uuid, uuidv7()), $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${MEETUP_COLUMNS}`,
      [
        payload.meetup_id ?? null,
        payload.trip_id,
        place.poiId,
        place.name,
        place.lat,
        place.lng,
        payload.at,
        ctx.uid,
      ],
    );
    const meetup = meetupWire(firstRow(rows, 'meetup insert'));
    await publishLiveMap(tx, payload.trip_id, 'meetup.created', { meetup });
    await appendDomainEvent(tx, {
      type: 'meetup.created',
      aggregateKind: 'meetup',
      aggregateId: meetup.id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: payload.trip_id,
      payload: { trip_id: payload.trip_id, meetup_id: meetup.id, by: ctx.uid },
    });
    await armMeetupEtas(tx, meetup.id, await tripZone(tx, payload.trip_id));
    return meetup;
  },
});
