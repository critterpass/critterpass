/**
 * The guide's supplier tools (docs/api-contracts.md §6), registered by `registerApiToolExecutors`.
 * Supplier content never reaches the model: offers come back as ids, a price and whether a hold is
 * possible, never a title or a description.
 *
 * - `ride_quote`: Grab's fare range and pickup time between two points of the turn's trip. Without
 *   an estimate (Grab not in the market, its switch off, no answer) the tool is unavailable, so the
 *   guide says it cannot check rather than guess; it never claims a car is booked.
 * - `bookable_activity`: Viator offers for a place the catalogue links to Viator (its destination
 *   and product in `pois.source_ids`), only while the Viator booking switch is on.
 * - `propose_hold`, `propose_vendor_message`: drafts. They check the proposal can be carried out
 *   and answer a draft id; a person confirms in the app (`hold_activity`,
 *   `request_vendor_message` with that id), nothing is held or sent here.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import { DomainError, generateUuidV7 } from '@cp/domain';
import { isPartnerEnabled, toSupplierDomainError, VIATOR_PARTNER_KEY } from '@cp/suppliers';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { createAuditedSupplierHttp } from './http';
import type { SupplierEnv } from './link-config';
import { viatorPortFromEnv, type ActivityBookingPort } from './order-port';
import { toMinor } from './order-store';
import { rideRoutingFromEnv } from './ride-fare-estimate';
import { createRideQuoter, grabEstimatorFromEnv, type RideQuoter } from './rides-quote';

function turnTrip(context: ToolContext): string {
  if (context.tripId === null) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return context.tripId;
}

export interface SupplierToolDeps {
  readonly quoter: RideQuoter;
  readonly port: ActivityBookingPort | undefined;
}

export function supplierToolDepsFromEnv(
  pool: pg.Pool,
  env: SupplierEnv = process.env,
): SupplierToolDeps {
  const http = createAuditedSupplierHttp(pool);
  return {
    quoter: createRideQuoter({
      pool,
      grab: grabEstimatorFromEnv(env, http),
      routing: rideRoutingFromEnv(env),
    }),
    port: viatorPortFromEnv(env, http),
  };
}

const PRODUCT_CODE = /^[A-Za-z0-9_-]{1,64}$/;

interface TurnTrip {
  readonly member: boolean;
  readonly start_date: string | null;
  readonly currency: string | null;
}

/** The turn's trip as its member sees it; `NOT_FOUND` for anyone else. */
async function memberTrip(tx: pg.PoolClient, tripId: string): Promise<TurnTrip> {
  const { rows } = await tx.query<TurnTrip>(
    `SELECT app.is_trip_member(t.id) AS member, t.start_date::text AS start_date, d.currency
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined || !trip.member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip;
}

async function requireViator(
  tx: pg.PoolClient,
  port: ActivityBookingPort | undefined,
): Promise<ActivityBookingPort> {
  const on = await asSystemRole(tx, () =>
    isPartnerEnabled((sql, params) => tx.query(sql, [...params]), VIATOR_PARTNER_KEY),
  );
  if (!on || port === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { supplier: 'viator', reason: 'flag_off' });
  }
  return port;
}

export function registerSupplierToolExecutors(
  registry: ToolRegistry,
  pool: pg.Pool,
  deps: SupplierToolDeps = supplierToolDepsFromEnv(pool),
): void {
  registry.registerToolExecutor('ride_quote', async (input, context) => {
    const quote = await deps.quoter.quotePoints(
      context.uid,
      turnTrip(context),
      input.from,
      input.to,
    );
    const estimate = quote.estimate;
    if (estimate === null) {
      throw new DomainError('SUPPLIER_UNAVAILABLE', { supplier: 'grab', reason: 'no_estimate' });
    }
    return {
      provider: estimate.provider,
      fare_range_minor: { min: estimate.fare_low_minor, max: estimate.fare_high_minor },
      currency: estimate.currency,
      eta_min: estimate.eta_min,
      deep_link_ref: estimate.deep_link,
    };
  });

  registry.registerToolExecutor('bookable_activity', async (input, context) => {
    const tripId = turnTrip(context);
    const found = await withUser(pool, context.uid, generateUuidV7(), async (tx) => {
      const trip = await memberTrip(tx, tripId);
      const port = await requireViator(tx, deps.port);
      const { rows } = await tx.query<{ destination: string | null; product: string | null }>(
        `SELECT source_ids->>'viator_destination' AS destination, source_ids->>'viator' AS product
           FROM pois WHERE id = $1`,
        [input.poi_id],
      );
      const refs = rows[0];
      if (refs === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi' });
      return { port, refs, currency: trip.currency ?? 'USD' };
    });
    const { destination, product } = found.refs;
    if (destination === null || !/^\d{1,12}$/.test(destination)) return { offers: [] };
    let offers;
    try {
      offers = await found.port.search({
        destinationRef: destination,
        date: input.date,
        currency: found.currency,
      });
    } catch (error) {
      throw toSupplierDomainError(error, 'viator');
    }
    return {
      offers: offers
        .filter((offer) => product === null || offer.productCode === product)
        .flatMap((offer) =>
          offer.priceFrom === null
            ? []
            : [
                {
                  offer_ref: offer.productCode,
                  supplier: offer.supplier,
                  price_from_minor: Number(
                    toMinor(offer.priceFrom.amount, offer.priceFrom.currency),
                  ),
                  currency: offer.priceFrom.currency,
                  hold_supported: offer.holdSupported,
                },
              ],
        )
        .slice(0, 5),
    };
  });

  registry.registerToolExecutor('propose_hold', (input, context) =>
    withUser(pool, context.uid, generateUuidV7(), async (tx) => {
      const trip = await memberTrip(tx, turnTrip(context));
      await requireViator(tx, deps.port);
      if (!PRODUCT_CODE.test(input.offer_ref)) {
        throw new DomainError('VALIDATION', { reason: 'offer_ref' });
      }
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.time) || input.pax < 1 || input.pax > 30) {
        throw new DomainError('VALIDATION', { reason: 'slot' });
      }
      if (trip.start_date !== null && input.date < trip.start_date) {
        throw new DomainError('VALIDATION', { reason: 'before_trip' });
      }
      return { draft_id: generateUuidV7() };
    }),
  );

  registry.registerToolExecutor('propose_vendor_message', (input, context) =>
    withUser(pool, context.uid, generateUuidV7(), async (tx) => {
      const tripId = turnTrip(context);
      await memberTrip(tx, tripId);
      const text = input.text.trim();
      if (text === '' || text.length > 1000)
        throw new DomainError('VALIDATION', { reason: 'text' });
      const { rowCount } = await tx.query(
        `SELECT 1 FROM providers WHERE id::text = $1 AND trip_id = $2 AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM pois WHERE id::text = $1`,
        [input.vendor_ref, tripId],
      );
      if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'vendor' });
      return { draft_id: generateUuidV7() };
    }),
  );
}
