/**
 * The ride loader: the Grab fare a traveller last checked for a leg stays on their own lock screen
 * (service, fare range, pickup ETA and how old the quote is) for half an hour, because prices move.
 * It ends early when they check another fare (the newer quote takes its place) or log the ride.
 * It is a quote, never a car on its way; the link opens the app's getting-around screen, which
 * hands over to Grab, so no pickup or drop-off position travels in a push.
 */
import {
  buildRideLaAttributes,
  buildRideLaState,
  LA_COPY,
  LA_RIDE_TTL_MS,
  type RideLaInput,
} from '@cp/domain';

import { ROUTINE, type LaLoader } from './snapshot';

const LINGER_MS = 60_000;

interface QuoteRow {
  id: string;
  trip_id: string;
  user_id: string;
  service_name: string;
  fare_low_minor: number;
  fare_high_minor: number;
  currency: string;
  eta_min: number;
  surge: RideLaInput['surge'];
  fetched_at: Date;
  from_name: string | null;
  to_name: string;
  /** The traveller checked another fare since, or logged this ride. */
  replaced: boolean;
}

export const rideLoader: LaLoader = async ({ tx, refId, now, redact }) => {
  const { rows } = await tx.query<QuoteRow>(
    `SELECT q.id, q.trip_id, q.user_id, q.service_name, q.fare_low_minor::float8 AS fare_low_minor,
            q.fare_high_minor::float8 AS fare_high_minor, q.currency, q.eta_min, q.surge,
            q.fetched_at, f.name AS from_name, t.name AS to_name,
            (EXISTS (SELECT 1 FROM ride_quotes n
                      WHERE n.user_id = q.user_id AND n.trip_id = q.trip_id
                        AND (n.fetched_at, n.id) > (q.fetched_at, q.id))
             OR EXISTS (SELECT 1 FROM rides r WHERE r.quote_id = q.id)) AS replaced
       FROM ride_quotes q
       JOIN pois t ON t.id = q.to_poi_id
       LEFT JOIN pois f ON f.id = q.from_poi_id
      WHERE q.id = $1 AND q.provider = 'grab'`,
    [refId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const input: RideLaInput = {
    tripId: row.trip_id,
    quoteId: row.id,
    // Someone hiding lock-screen details sees the service, not where they are going.
    fromName: redact === true ? null : row.from_name,
    toName: redact === true ? row.service_name : row.to_name,
    serviceName: row.service_name,
    fareLowMinor: row.fare_low_minor,
    fareHighMinor: row.fare_high_minor,
    currency: row.currency.trim(),
    etaMin: row.eta_min,
    surge: row.surge,
    fetchedAt: row.fetched_at,
    // The activity opens the app's own route (under each build's scheme); Grab's link stays in-app.
    deepLink: 'critterpass://getting-around',
  };
  const expiresAt = new Date(row.fetched_at.getTime() + LA_RIDE_TTL_MS);
  const live = !row.replaced && now.getTime() < expiresAt.getTime();
  const attributes = buildRideLaAttributes(input);
  return {
    tripId: row.trip_id,
    live,
    audience: [row.user_id],
    attributes: () => Promise.resolve(attributes),
    state: (seq) => ({
      ...buildRideLaState(input, now, seq),
      ...(live ? {} : { state: 'expired' as const }),
    }),
    startAlert: {
      title: LA_COPY.rideStartTitle,
      body: LA_COPY.rideStartBody,
      vars: { service: row.service_name, route: attributes.route, eta: row.eta_min },
    },
    endsAt: expiresAt,
    lingerMs: LINGER_MS,
    urgency: () => ROUTINE,
  };
};
