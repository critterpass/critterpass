/**
 * `request_crew_lock_screen` (doc delta: new command), from the crew map's "put this on the lock
 * screen" (5a-6): on a boosted trip it puts the meet-up's crew-live activity on every member's
 * phone (now, or 30 minutes before the meet-up when that is later); on an unboosted trip it answers
 * `ENTITLEMENT_REQUIRED {perk: boost_active, offers}` and the app shows the Boost offer sheet.
 */
import { appendDomainEvent, type KillSwitchReader } from '@cp/db';
import {
  DomainError,
  LA_MEET_UP_LEAD_MS,
  LA_MEET_UP_TAIL_MS,
  requestCrewLockScreenPayloadSchema,
  type RequestCrewLockScreenResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { entitle } from '../../entitlements';
import { defineCommand } from '../_framework/define-command';
import { requireTripParticipant } from '../live-map/shared';

export function requestCrewLockScreenCommand(switches: Pick<KillSwitchReader, 'assertOn'>) {
  return defineCommand({
    name: 'request_crew_lock_screen',
    v: 1,
    schema: requestCrewLockScreenPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    },
    entitle: async (tx, payload, ctx) => {
      await entitle(
        tx,
        { uid: ctx.uid, deviceTz: ctx.device.tz },
        { kind: 'capability', key: 'boost_active', tripId: payload.trip_id },
      );
    },
    handle: async (tx, payload, ctx): Promise<RequestCrewLockScreenResult> => {
      await switches.assertOn('la.meet_up.enabled');
      const now = ctx.clock.serverNow;
      return asSystemRole(tx, async () => {
        const { rows } = await tx.query<{ id: string; meet_at: Date }>(
          `SELECT id, meet_at FROM meetups
            WHERE trip_id = $1 AND status = 'active' AND ($2::uuid IS NULL OR id = $2)
              AND meet_at > $3::timestamptz - make_interval(secs => $4 / 1000.0)
            ORDER BY meet_at LIMIT 1`,
          [payload.trip_id, payload.meetup_id ?? null, now, LA_MEET_UP_TAIL_MS],
        );
        const meetup = rows[0];
        if (meetup === undefined) throw new DomainError('NOT_FOUND', { reason: 'no_meetup' });
        await tx.query(
          `INSERT INTO la_object_states (kind, ref_id, trip_id) VALUES ('meet_up', $1, $2)
           ON CONFLICT (kind, ref_id) DO UPDATE SET phase = 'live', ended_at = NULL`,
          [meetup.id, payload.trip_id],
        );
        await appendDomainEvent(tx, {
          type: 'la.crew_requested',
          aggregateKind: 'meetup',
          aggregateId: meetup.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          payload: { trip_id: payload.trip_id, meetup_id: meetup.id, user_id: ctx.uid },
        });
        const opens = meetup.meet_at.getTime() - LA_MEET_UP_LEAD_MS;
        return {
          meetup_id: meetup.id,
          starts_at: new Date(Math.max(now.getTime(), opens)).toISOString(),
        };
      });
    },
  });
}
