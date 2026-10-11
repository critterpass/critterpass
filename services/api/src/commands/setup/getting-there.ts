/**
 * `set_getting_there` (docs/api-contracts.md §4.5 doc delta): a setup member says how they get to
 * the trip. With their own booking on the trip the booking stands in for an estimate (and gives
 * the arrival when they did not say one); otherwise the estimate is the stored way of that kind
 * from where they leave (an airport code, else their home airport) to the trip's place, the same
 * answer `GET /v1/destinations/{id}/getting-there` gives, and a pair nobody has looked up yet is
 * queued so the estimate follows. The crew sees everyone's way; a draft from the guide that she
 * has not touched is made again with it.
 */
import { sendInTx } from '@cp/db';
import {
  DomainError,
  PLACES_QUEUES,
  placesHomeLinkKey,
  setGettingTherePayloadSchema,
  type SetGettingThereResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { draftAgainWithNewAnswers } from '../draft/as-you-go';
import { MEMBER_INPUT_STATUSES, requireSetupMember, requireStatus } from './shared';

const IATA = /^[A-Z]{3}$/u;

interface StoredWay {
  readonly mode: string;
  readonly minutes: number;
  readonly cost_pp_minor: number | null;
  readonly cost_currency: string | null;
}

interface Estimate {
  readonly minor: number | null;
  readonly currency: string | null;
  readonly minutes: number | null;
}

const NO_ESTIMATE: Estimate = { minor: null, currency: null, minutes: null };

/** The stored way of this kind from `origin` to the place; queues the pair when it is missing. */
async function estimateFor(
  tx: pg.PoolClient,
  destinationId: string,
  origin: string,
  mode: string,
): Promise<Estimate> {
  const { rows } = await tx.query<{ ways: StoredWay[]; stale: boolean }>(
    `SELECT ways, (status = 'failed' OR (status <> 'pending' AND coalesce(expires_at <= now(), true)))
              AS stale
       FROM destination_home_links WHERE destination_id = $1 AND origin_key = $2`,
    [destinationId, origin],
  );
  const row = rows[0];
  if (row === undefined || row.stale) {
    await sendInTx(
      tx,
      PLACES_QUEUES.homeLink,
      { destination_id: destinationId, origin },
      { singletonKey: placesHomeLinkKey(destinationId, origin) },
    );
  }
  const way = (row?.ways ?? []).find((candidate) => candidate.mode === mode);
  if (way === undefined) return NO_ESTIMATE;
  const priced = way.cost_pp_minor !== null && way.cost_currency !== null;
  return {
    minor: priced ? way.cost_pp_minor : null,
    currency: priced ? way.cost_currency : null,
    minutes: way.minutes,
  };
}

export const setGettingThereCommand = defineCommand({
  name: 'set_getting_there',
  v: 1,
  schema: setGettingTherePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireStatus(await requireSetupMember(tx, payload.trip_id, ctx.uid), MEMBER_INPUT_STATUSES);
  },
  handle: async (tx, payload, ctx): Promise<SetGettingThereResult> => {
    let arrivesAt = payload.arrives_at;
    if (payload.booking_id !== undefined && payload.booking_id !== null) {
      const booking = await tx.query<{ ends_at: Date | null }>(
        `SELECT ends_at FROM bookings
          WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL
            AND (owner_id = $3 OR $3 = ANY (traveller_ids))`,
        [payload.booking_id, payload.trip_id, ctx.uid],
      );
      const found = booking.rows[0];
      if (found === undefined) throw new DomainError('NOT_FOUND', { reason: 'booking' });
      if (arrivesAt === undefined && found.ends_at !== null) {
        arrivesAt = found.ends_at.toISOString();
      }
    }
    return asSystemRole(tx, async () => {
      const facts = await tx.query<{ destination_id: string | null; home: string | null }>(
        `SELECT t.destination_id, upper(u.home_airport) AS home
           FROM trips t, users u WHERE t.id = $1 AND u.id = $2`,
        [payload.trip_id, ctx.uid],
      );
      const destinationId = facts.rows[0]?.destination_id ?? null;
      const typed = payload.from?.toUpperCase();
      const origin = typed !== undefined && IATA.test(typed) ? typed : facts.rows[0]?.home;
      const booked = payload.booking_id !== undefined && payload.booking_id !== null;
      const estimate =
        booked || destinationId === null || origin === null || origin === undefined
          ? NO_ESTIMATE
          : await estimateFor(tx, destinationId, origin, payload.mode);
      await tx.query(
        `INSERT INTO trip_member_setup AS s (trip_id, user_id, way_mode, way_from, way_arrives_at,
           way_minutes, way_estimate_minor, way_currency, way_booking_id, way_set_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (trip_id, user_id) DO UPDATE
           SET way_mode = EXCLUDED.way_mode,
               way_from = coalesce(EXCLUDED.way_from, s.way_from),
               way_arrives_at = CASE WHEN $10::boolean THEN EXCLUDED.way_arrives_at
                                     ELSE s.way_arrives_at END,
               way_minutes = EXCLUDED.way_minutes,
               way_estimate_minor = EXCLUDED.way_estimate_minor,
               way_currency = EXCLUDED.way_currency,
               way_booking_id = CASE WHEN $11::boolean THEN EXCLUDED.way_booking_id
                                     ELSE s.way_booking_id END,
               way_set_at = EXCLUDED.way_set_at`,
        [
          payload.trip_id,
          ctx.uid,
          payload.mode,
          payload.from ?? origin ?? null,
          arrivesAt ?? null,
          estimate.minutes,
          estimate.minor,
          estimate.currency,
          payload.booking_id ?? null,
          arrivesAt !== undefined,
          payload.booking_id !== undefined,
        ],
      );
      await draftAgainWithNewAnswers(tx, payload.trip_id, ctx.uid);
      return {
        trip_id: payload.trip_id,
        mode: payload.mode,
        estimate_minor: estimate.minor,
        currency: estimate.currency,
        minutes: estimate.minutes,
      };
    });
  },
});
