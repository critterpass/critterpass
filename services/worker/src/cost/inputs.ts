/**
 * Loads everything a trip's cost calc depends on, as app_system, into `@cp/cost-engine` shapes:
 * the seated members and their home airports, the trip's quotes (latest per kind and origin), the
 * nightly fare for any origin without a quote, the priced items of the current (else draft) plan,
 * the destination's reviewed editorial index for stays without a quote plus food and fun, and the
 * latest FX run when any price is in another currency. Pure mapping lives here; nothing is priced.
 */
import {
  assertCurrencyCode,
  canonicalJson,
  fnv1a64,
  type CostComponent,
  type CostMember,
  type CurrencyCode,
  type FxContext,
  type FxSnapshot,
} from '@cp/cost-engine';
import type pg from 'pg';
import { loadRoomComponents, pricedByRooms } from '../jobs/setup/room-costs';

/** Currency a trip is priced in when its crew has not picked a settlement currency yet. */
export const DEFAULT_TRIP_CURRENCY: CurrencyCode = 'USD';

export interface CostInputs {
  readonly tripId: string;
  readonly currency: CurrencyCode;
  readonly members: readonly CostMember[];
  readonly components: readonly CostComponent[];
  readonly fx?: FxContext;
  /** The `fx_snapshots` row stored on the calc (the run's rate into the trip currency). */
  readonly fxSnapshotId: string | null;
  /** Content hash of everything above: the calc version and the idempotency key. */
  readonly version: string;
}

interface TripRow {
  readonly destination_id: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly version_id: string | null;
  readonly settlement_currency: string | null;
}

const QUOTE_UNITS = {
  flight: 'person',
  stay: 'group',
  activity: 'person',
  transfer: 'group',
} as const;
const IATA = /^[A-Z]{3}$/;
const DAY_MS = 86_400_000;

const iso = (value: Date | string) => new Date(value).toISOString();

async function loadMembers(tx: pg.PoolClient, tripId: string): Promise<CostMember[]> {
  const { rows } = await tx.query<{ user_id: string; origin: string | null }>(
    `SELECT p.user_id, upper(u.home_airport) AS origin
       FROM trip_participants p JOIN users u ON u.id = p.user_id
      WHERE p.trip_id = $1 AND p.holds_seat
      ORDER BY p.user_id`,
    [tripId],
  );
  return rows.map((r) => ({
    uid: r.user_id,
    origin: r.origin && IATA.test(r.origin) ? r.origin : null,
  }));
}

async function loadQuotes(tx: pg.PoolClient, tripId: string): Promise<CostComponent[]> {
  const { rows } = await tx.query<{
    id: string;
    kind: keyof typeof QUOTE_UNITS;
    origin: string | null;
    amount_minor: string;
    currency: string;
    source: 'travelpayouts' | 'viator' | 'user' | 'estimate';
    fetched_at: Date;
    frozen_at: Date | null;
  }>(
    `SELECT DISTINCT ON (kind, coalesce(upper(origin), '')) id, kind, upper(origin) AS origin,
            amount_minor, currency, source, fetched_at, frozen_at
       FROM price_quotes WHERE trip_id = $1
      ORDER BY kind, coalesce(upper(origin), ''), fetched_at DESC, id DESC`,
    [tripId],
  );
  return rows.map((r) => ({
    id: `quote:${r.kind}:${r.origin ?? 'all'}`,
    kind: r.kind,
    unit: QUOTE_UNITS[r.kind],
    amountMinor: BigInt(r.amount_minor),
    currency: assertCurrencyCode(r.currency),
    source: r.source,
    seenAt: iso(r.fetched_at),
    ...(r.frozen_at ? { frozenAt: iso(r.frozen_at) } : {}),
    ...(r.kind === 'flight' && r.origin ? { origin: r.origin } : {}),
    quoteId: r.id,
  }));
}

/** Cheapest nightly fare per origin for the trip's month; a missing fare stays `null`. */
async function loadFares(
  tx: pg.PoolClient,
  trip: TripRow,
  origins: readonly string[],
): Promise<CostComponent[]> {
  if (origins.length === 0 || !trip.destination_id || !trip.start_date) return [];
  const { rows } = await tx.query<{
    origin_iata: string;
    price_minor: string;
    currency: string;
    fetched_at: Date;
    fastest_duration_min: number | null;
  }>(
    `SELECT DISTINCT ON (origin_iata) origin_iata, price_minor, currency, fetched_at, fastest_duration_min
       FROM fare_cells
      WHERE destination_id = $1 AND month = date_trunc('month', $2::date)::date
        AND origin_iata = ANY($3) AND price_minor IS NOT NULL
      ORDER BY origin_iata, price_minor, dest_iata`,
    [trip.destination_id, trip.start_date, origins],
  );
  return origins.map((origin) => {
    const cell = rows.find((r) => r.origin_iata === origin);
    return {
      id: `fare:${origin}`,
      kind: 'flight' as const,
      unit: 'person' as const,
      origin,
      amountMinor: cell ? BigInt(cell.price_minor) : null,
      currency: assertCurrencyCode(cell?.currency ?? DEFAULT_TRIP_CURRENCY),
      source: 'travelpayouts' as const,
      seenAt: iso(cell?.fetched_at ?? `${trip.start_date}T00:00:00Z`),
      ...(cell?.fastest_duration_min ? { durationMin: cell.fastest_duration_min } : {}),
    };
  });
}

async function loadPlanItems(
  tx: pg.PoolClient,
  versionId: string | null,
): Promise<CostComponent[]> {
  if (!versionId) return [];
  const { rows } = await tx.query<{
    stable_id: string;
    cost_model: 'per_person' | 'group' | 'unit';
    amount_minor: string;
    currency: string;
    attendee_ids: string[] | null;
    updated_at: Date;
  }>(
    `SELECT stable_id, cost_model, amount_minor, currency, attendee_ids, updated_at
       FROM plan_items
      WHERE version_id = $1 AND cost_model IS NOT NULL AND amount_minor IS NOT NULL
        AND currency IS NOT NULL
      ORDER BY stable_id`,
    [versionId],
  );
  return rows.map((r) => ({
    id: `item:${r.stable_id}`,
    kind: 'activity' as const,
    unit: r.cost_model === 'per_person' ? ('person' as const) : ('group' as const),
    amountMinor: BigInt(r.amount_minor),
    currency: assertCurrencyCode(r.currency),
    source: 'user' as const,
    seenAt: iso(r.updated_at),
    ...(r.attendee_ids && r.attendee_ids.length > 0
      ? { memberIds: [...r.attendee_ids].sort() }
      : {}),
  }));
}

/** Food, fun and (when no stay was quoted) the cheapest stay type, from the reviewed index. */
async function loadIndexEstimates(
  tx: pg.PoolClient,
  trip: TripRow,
  hasStayQuote: boolean,
): Promise<CostComponent[]> {
  if (!trip.destination_id || !trip.start_date || !trip.end_date) return [];
  const nights = Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / DAY_MS);
  if (nights < 0) return [];
  const { rows } = await tx.query<{
    stay_type: string;
    nightly_minor_high: string;
    food_pp_day_minor: string;
    fun_pp_day_minor: string;
    currency: string;
    reviewed_at: Date;
  }>(
    `SELECT stay_type, nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, reviewed_at
       FROM destination_cost_indices
      WHERE destination_id = $1 AND reviewed_at IS NOT NULL
      ORDER BY nightly_minor_high, stay_type`,
    [trip.destination_id],
  );
  const cheapest = rows[0];
  if (!cheapest) return [];
  const days = BigInt(nights + 1);
  const base = {
    unit: 'person' as const,
    currency: assertCurrencyCode(cheapest.currency),
    source: 'editorial' as const,
    seenAt: iso(cheapest.reviewed_at),
  };
  return [
    {
      ...base,
      id: 'index:food',
      kind: 'food',
      amountMinor: BigInt(cheapest.food_pp_day_minor) * days,
    },
    {
      ...base,
      id: 'index:fun',
      kind: 'fun',
      amountMinor: BigInt(cheapest.fun_pp_day_minor) * days,
    },
    ...(hasStayQuote || nights === 0
      ? []
      : [
          {
            ...base,
            id: `index:stay:${cheapest.stay_type}`,
            kind: 'stay' as const,
            amountMinor: BigInt(cheapest.nightly_minor_high) * BigInt(nights),
            label: cheapest.stay_type,
          },
        ]),
  ];
}

async function loadFx(
  tx: pg.PoolClient,
  currency: CurrencyCode,
): Promise<{ fx: FxContext; id: string } | null> {
  const { rows } = await tx.query<{
    id: string;
    base: string;
    quote: string;
    rate: string;
    as_of: string;
    source: string;
  }>(
    `SELECT id, base, quote, rate::text AS rate, as_of::text AS as_of, source FROM fx_snapshots
      WHERE as_of = (SELECT max(as_of) FROM fx_snapshots) ORDER BY quote, source`,
  );
  const pinned = rows.find((r) => r.quote === currency) ?? rows[0];
  if (!pinned) return null;
  const snapshots: FxSnapshot[] = rows.map((r) => ({
    base: assertCurrencyCode(r.base),
    quote: assertCurrencyCode(r.quote),
    rate: r.rate,
    asOf: r.as_of,
    source: r.source,
  }));
  return { fx: { snapshotId: pinned.id, snapshots }, id: pinned.id };
}

export async function loadCostInputs(
  tx: pg.PoolClient,
  tripId: string,
): Promise<CostInputs | null> {
  const { rows } = await tx.query<TripRow>(
    `SELECT t.destination_id, t.start_date::text AS start_date, t.end_date::text AS end_date,
            coalesce(t.current_version_id, t.draft_version_id) AS version_id, c.settlement_currency
       FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
    [tripId],
  );
  const trip = rows[0];
  if (!trip) return null;
  const currency = assertCurrencyCode(trip.settlement_currency ?? DEFAULT_TRIP_CURRENCY);
  const members = await loadMembers(tx, tripId);
  const quotes = await loadQuotes(tx, tripId);
  const quotedOrigins = new Set(quotes.filter((q) => q.kind === 'flight').map((q) => q.origin));
  const unquoted = [...new Set(members.flatMap((m) => (m.origin ? [m.origin] : [])))]
    .filter((origin) => !quotedOrigins.has(origin))
    .sort();
  const components = [
    ...quotes,
    ...(await loadFares(tx, trip, unquoted)),
    ...(await loadPlanItems(tx, trip.version_id)),
    ...pricedByRooms(
      await loadIndexEstimates(
        tx,
        trip,
        quotes.some((q) => q.kind === 'stay'),
      ),
      await loadRoomComponents(tx, tripId),
      trip,
    ),
  ];
  const needsFx = components.some((c) => c.currency !== currency);
  const fx = needsFx ? await loadFx(tx, currency) : null;
  const version = `cv_${fnv1a64(
    canonicalJson({ currency, members, components, fx: fx?.id ?? null }),
  )}`;
  return {
    tripId,
    currency,
    members,
    components,
    ...(fx ? { fx: fx.fx } : {}),
    fxSnapshotId: fx?.id ?? null,
    version,
  };
}
