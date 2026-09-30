/**
 * `GET /v1/rides/quote` (docs/api-contracts.md §5): Grab's fare range and pickup time with its
 * "Open Grab" deep link where Grab runs and the Farefeed switch is on; always the market's plain app
 * links and the phrase card for the drop-off. Our own answer is cached 60 s per rider and route (the
 * estimate itself is Grab's), and each estimate is kept in `ride_quotes` for the offline card.
 * Nothing here books a car or claims one is coming.
 */
import { withSystem, withUser } from '@cp/db';
import {
  DomainError,
  generateUuidV7,
  RIDE_COPY_KEYS,
  rideAppsFor,
  rideQuoteQuerySchema,
  type RideQuoteQuery,
  type RideQuoteResult,
} from '@cp/domain';
import {
  createGrabTokenSource,
  GRAB_PRODUCTION_URL,
  isPartnerEnabled,
  quoteRide,
  type GrabEstimator,
  type SupplierHttp,
} from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import type { SupplierEnv } from './link-config';
import { toMinor } from './order-store';

export const RIDE_QUOTE_CACHE_MS = 60_000;
export const GRAB_FAREFEED_PARTNER = 'grab_farefeed';

export function grabEstimatorFromEnv(
  env: SupplierEnv,
  http: SupplierHttp,
): GrabEstimator | undefined {
  const clientId = env['GRAB_CLIENT_ID'];
  const clientSecret = env['GRAB_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return undefined;
  const config = {
    clientId,
    clientSecret,
    baseUrl: env['GRAB_API_BASE_URL'] || GRAB_PRODUCTION_URL,
  };
  return { http, config, tokens: createGrabTokenSource(http, config) };
}

export interface RidePlace {
  readonly lat: number;
  readonly lng: number;
  readonly name: string;
  readonly poiId?: string;
  readonly nameLocal?: string | null;
  readonly address?: string | null;
}

export interface RideQuoterDeps {
  readonly pool: pg.Pool;
  readonly grab: GrabEstimator | undefined;
  readonly now?: () => Date;
  readonly onError?: (error: unknown) => void;
}

interface PoiRow {
  id: string;
  name: string;
  name_local: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

async function loadPoi(tx: pg.PoolClient, id: string): Promise<RidePlace> {
  const { rows } = await tx.query<PoiRow>(
    'SELECT id, name, name_local, address, lat, lng FROM pois WHERE id = $1',
    [id],
  );
  const poi = rows[0];
  if (poi === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi' });
  return {
    poiId: poi.id,
    name: poi.name,
    nameLocal: poi.name_local,
    address: poi.address,
    lat: poi.lat,
    lng: poi.lng,
  };
}

/** The trip's country, as its destination names it; `NOT_FOUND` for anyone outside the trip. */
export async function tripCountry(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  const { rows } = await tx.query<{ member: boolean; country: string | null }>(
    `SELECT app.is_trip_member(t.id) AS member, d.country
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined || !trip.member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip.country;
}

export function createRideQuoter(deps: RideQuoterDeps) {
  const now = deps.now ?? (() => new Date());
  const cache = new Map<string, { at: number; result: RideQuoteResult }>();

  async function quotePlaces(
    uid: string,
    tripId: string,
    country: string | null,
    from: RidePlace,
    to: RidePlace,
  ): Promise<RideQuoteResult> {
    const key = `${uid}|${tripId}|${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.poiId ?? `${to.lat},${to.lng}`}`;
    const hit = cache.get(key);
    if (hit !== undefined && now().getTime() - hit.at < RIDE_QUOTE_CACHE_MS) return hit.result;
    const enabled = await withSystem(deps.pool, (tx) =>
      isPartnerEnabled((sql, params) => tx.query(sql, [...params]), GRAB_FAREFEED_PARTNER),
    );
    const apps = rideAppsFor(country);
    const quote = await quoteRide(
      deps.grab,
      { apps, estimateEnabled: enabled, from, to },
      deps.onError,
    );
    const fetchedAt = now();
    let estimate: RideQuoteResult['estimate'] = null;
    if (quote.estimate !== null) {
      const lead = quote.estimate;
      const quoteId = generateUuidV7();
      const low = toMinor(lead.minFare, lead.currency);
      const high = toMinor(lead.maxFare, lead.currency);
      if (to.poiId !== undefined) {
        await withSystem(deps.pool, (tx) =>
          tx.query(
            `INSERT INTO ride_quotes (id, trip_id, user_id, provider, from_poi_id, to_poi_id,
               service_name, fare_low_minor, fare_high_minor, currency, eta_min, surge, fetched_at)
             VALUES ($1, $2, $3, 'grab', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              quoteId,
              tripId,
              uid,
              from.poiId ?? null,
              to.poiId,
              lead.name.slice(0, 80),
              low.toString(),
              high.toString(),
              lead.currency,
              lead.etaMin,
              lead.surge,
              fetchedAt,
            ],
          ),
        );
      }
      estimate = {
        quote_id: quoteId,
        provider: 'grab',
        service: lead.name,
        eta_min: lead.etaMin,
        fare_low_minor: Number(low),
        fare_high_minor: Number(high),
        currency: lead.currency,
        surge: lead.surge,
        fetched_at: fetchedAt.toISOString(),
        deep_link: lead.deepLink,
      };
    }
    const result: RideQuoteResult = {
      copy_key:
        estimate !== null
          ? RIDE_COPY_KEYS.estimate
          : quote.links.length > 0
            ? RIDE_COPY_KEYS.links
            : RIDE_COPY_KEYS.phraseCard,
      estimate,
      links: quote.links,
      phrase_card: {
        poi_id: to.poiId ?? '',
        name: to.name,
        name_local: to.nameLocal ?? null,
        address: to.address ?? null,
      },
    };
    cache.set(key, { at: now().getTime(), result });
    return result;
  }

  return {
    /** A quote between two places of the trip (or the phone's position and a place). */
    async quote(uid: string, query: RideQuoteQuery): Promise<RideQuoteResult> {
      const { country, from, to } = await withUser(deps.pool, uid, generateUuidV7(), async (tx) => {
        const place = await tripCountry(tx, query.trip_id);
        const dropOff = await loadPoi(tx, query.to_poi);
        const pickUp =
          query.from_poi !== undefined
            ? await loadPoi(tx, query.from_poi)
            : { ...(query.from as { lat: number; lng: number }), name: '' };
        return { country: place, from: pickUp, to: dropOff };
      });
      return quotePlaces(uid, query.trip_id, country, from, to);
    },
    /** A quote between two points, for the guide's `ride_quote` tool. */
    async quotePoints(
      uid: string,
      tripId: string,
      from: { lat: number; lng: number },
      to: { lat: number; lng: number },
    ): Promise<RideQuoteResult> {
      const country = await withUser(deps.pool, uid, generateUuidV7(), (tx) =>
        tripCountry(tx, tripId),
      );
      return quotePlaces(uid, tripId, country, { ...from, name: '' }, { ...to, name: '' });
    },
  };
}

export type RideQuoter = ReturnType<typeof createRideQuoter>;

export function registerRideQuoteRoute(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly sessions: SessionResolver; readonly quoter: RideQuoter },
): void {
  app.get('/v1/rides/quote', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = rideQuoteQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'query' });
    const result = await deps.quoter.quote(session.uid, parsed.data);
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(result);
  });
}
