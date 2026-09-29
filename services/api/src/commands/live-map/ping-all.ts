/**
 * `ping_all` (docs/api-contracts.md §4.12): PING ALL ("Pinged everyone: {place} at {time}.") or
 * I'M ON MY WAY (the caller's own ETA to the meet-up goes with it). Both reach the crew as the
 * ALWAYS crew ping and as a `ping` on the channel. Needs the network: never queued offline.
 */
import { appendDomainEvent } from '@cp/db';
import { pingAllPayloadSchema, type PingAllResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { activeMeetup, publishLiveMap, requireCrewMapOpen, requireTripParticipant } from './shared';

export const pingAllCommand = defineCommand({
  name: 'ping_all',
  v: 1,
  schema: pingAllPayloadSchema,
  offline: false,
  allowAnonymous: true,
  actionScope: 'trip_day',
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  entitle: (tx, payload, ctx) => requireCrewMapOpen(tx, payload.trip_id, ctx.uid, ctx.device.tz),
  handle: async (tx, payload, ctx): Promise<PingAllResult> => {
    const meetup = await activeMeetup(tx, payload.trip_id);
    let etaMin: number | null = null;
    if (payload.kind === 'on_my_way' && meetup !== null) {
      const { rows } = await tx.query<{ eta_min: number | null }>(
        'SELECT eta_min FROM member_etas WHERE trip_id = $1 AND user_id = $2 AND meetup_id = $3',
        [payload.trip_id, ctx.uid, meetup.id],
      );
      etaMin = rows[0]?.eta_min ?? null;
    }
    await publishLiveMap(tx, payload.trip_id, 'ping', {
      by: ctx.uid,
      kind: payload.kind,
      eta_min: etaMin,
    });
    await appendDomainEvent(tx, {
      type: 'crew.pinged',
      aggregateKind: 'trip',
      aggregateId: payload.trip_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: payload.trip_id,
      payload: {
        trip_id: payload.trip_id,
        by: ctx.uid,
        kind: payload.kind,
        meetup_id: meetup?.id ?? null,
        eta_min: etaMin,
      },
    });
    return {
      kind: payload.kind,
      eta_min: etaMin,
      place_name: meetup?.place_name ?? null,
      meet_at: meetup?.meet_at ?? null,
    };
  },
});
