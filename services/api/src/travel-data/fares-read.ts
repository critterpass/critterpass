/**
 * Fare reads for `/v1/fares`, the destination page and the `fare_calendar` tool, plus
 * `freezeFareQuote`. Every fare carries its source and when it was seen; a price last confirmed
 * more than 72 h ago is `stale` and shown as "no recent price" (its number is withheld), and an
 * origin with no usable price borrows its nearest hub's, labelled `via_hub`, never passed off as
 * the origin's own.
 */
import { withSystem } from '@cp/db';
import {
  DomainError,
  fareDaySchema,
  fareSeenAt,
  isFareStale,
  nearestFareHub,
  type FareDay,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

export const FARE_SOURCE = 'travelpayouts';

export type FareState = 'ok' | 'stale' | 'missing';

export interface FareView {
  readonly origin: string;
  readonly state: FareState;
  readonly source: typeof FARE_SOURCE;
  /** Null unless `state` is `ok`: a stale or missing fare is never a number. */
  readonly price_minor: number | null;
  readonly currency: string;
  readonly depart_on: string | null;
  readonly return_on: string | null;
  readonly transfers: number | null;
  readonly duration_min: number | null;
  readonly fastest_duration_min: number | null;
  readonly days: readonly FareDay[];
  readonly seen_at: string | null;
  readonly fetched_at: string | null;
  readonly checked_at: string | null;
  /** The hub whose fare stands in for an origin with no usable price of its own. */
  readonly via_hub: string | null;
}

interface FareCellRow {
  readonly id: string;
  readonly origin_iata: string;
  readonly price_minor: string | null;
  readonly currency: string;
  readonly depart_on: string | null;
  readonly return_on: string | null;
  readonly transfers: number | null;
  readonly duration_min: number | null;
  readonly fastest_duration_min: number | null;
  readonly days: unknown;
  readonly found_at: Date | null;
  readonly fetched_at: Date | null;
  readonly checked_at: Date;
}

const CELL_COLUMNS = `id, origin_iata, price_minor, currency, depart_on::text, return_on::text,
  transfers, duration_min, fastest_duration_min, days, found_at, fetched_at, checked_at`;

function toView(origin: string, row: FareCellRow | undefined, now: Date, viaHub: string | null) {
  if (row === undefined) {
    return {
      origin,
      state: 'missing',
      source: FARE_SOURCE,
      price_minor: null,
      currency: 'USD',
      depart_on: null,
      return_on: null,
      transfers: null,
      duration_min: null,
      fastest_duration_min: null,
      days: [],
      seen_at: null,
      fetched_at: null,
      checked_at: null,
      via_hub: viaHub,
    } satisfies FareView;
  }
  const state: FareState =
    row.price_minor === null ? 'missing' : isFareStale(row.fetched_at, now) ? 'stale' : 'ok';
  const ok = state === 'ok';
  return {
    origin,
    state,
    source: FARE_SOURCE,
    price_minor: ok ? Number(row.price_minor) : null,
    currency: row.currency,
    depart_on: ok ? row.depart_on : null,
    return_on: ok ? row.return_on : null,
    transfers: ok ? row.transfers : null,
    duration_min: ok ? row.duration_min : null,
    fastest_duration_min: row.fastest_duration_min,
    days: ok ? z.array(fareDaySchema).parse(row.days) : [],
    seen_at: fareSeenAt(row.found_at, row.fetched_at)?.toISOString() ?? null,
    fetched_at: row.fetched_at?.toISOString() ?? null,
    checked_at: row.checked_at.toISOString(),
    via_hub: viaHub,
  } satisfies FareView;
}

async function hubFor(tx: pg.PoolClient, origin: string): Promise<string | undefined> {
  const { rows } = await tx.query<{ lat: number; lng: number }>(
    `SELECT lat, lng FROM cities WHERE $1 = ANY (iata_nearby)
      ORDER BY population DESC NULLS LAST LIMIT 1`,
    [origin],
  );
  const city = rows[0];
  return city === undefined ? undefined : nearestFareHub(city.lat, city.lng, origin)?.iata;
}

export interface ReadFaresInput {
  readonly origins: readonly string[];
  readonly destIata: string;
  /** `YYYY-MM`. */
  readonly month: string;
  readonly now?: Date;
}

export async function readFares(tx: pg.PoolClient, input: ReadFaresInput): Promise<FareView[]> {
  const now = input.now ?? new Date();
  const origins = [...new Set(input.origins.map((origin) => origin.toUpperCase()))];
  const load = async (codes: readonly string[]) => {
    const { rows } = await tx.query<FareCellRow>(
      `SELECT ${CELL_COLUMNS} FROM fare_cells
        WHERE dest_iata = $1 AND month = $2 AND origin_iata = ANY ($3)`,
      [input.destIata, `${input.month}-01`, codes],
    );
    return new Map(rows.map((row) => [row.origin_iata, row]));
  };
  const cells = await load(origins);
  const views: FareView[] = [];
  for (const origin of origins) {
    const own = toView(origin, cells.get(origin), now, null);
    if (own.state === 'ok') {
      views.push(own);
      continue;
    }
    const hub = await hubFor(tx, origin);
    const hubCell = hub === undefined ? undefined : (await load([hub])).get(hub);
    const borrowed = hub === undefined ? undefined : toView(origin, hubCell, now, hub);
    views.push(borrowed?.state === 'ok' ? borrowed : own);
  }
  return views;
}

export interface FreezeFareQuoteInput {
  readonly tripId: string | null;
  readonly origin: string;
  readonly destinationId: string;
  readonly destIata: string;
  readonly month: string;
  readonly now?: Date;
}

export interface FrozenFareQuote {
  readonly quote_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly fetched_at: string;
  readonly frozen_at: string;
  readonly version: number;
}

/**
 * Pins today's fare for a poll or budget as a `price_quotes` row (kind `flight`, source
 * `travelpayouts`). Only a fresh fare can be frozen: a stale or missing one is `STATE_INVALID`
 * with `reason: no_recent_price`, so a vote never shows a number nobody has seen recently.
 */
export async function freezeFareQuote(
  pool: pg.Pool,
  input: FreezeFareQuoteInput,
): Promise<FrozenFareQuote> {
  const now = input.now ?? new Date();
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<FareCellRow>(
      `SELECT ${CELL_COLUMNS} FROM fare_cells
        WHERE origin_iata = $1 AND dest_iata = $2 AND month = $3`,
      [input.origin.toUpperCase(), input.destIata, `${input.month}-01`],
    );
    const view = toView(input.origin, rows[0], now, null);
    if (view.state !== 'ok' || view.price_minor === null || view.depart_on === null) {
      throw new DomainError('STATE_INVALID', { reason: 'no_recent_price' });
    }
    const inserted = await tx.query<{ id: string; version: number }>(
      `INSERT INTO price_quotes (trip_id, kind, origin, destination_id, dates, amount_minor,
         currency, source, fetched_at, frozen_at)
       VALUES ($1, 'flight', $2, $3, daterange($4::date, $5::date, '[]'), $6, $7, $8, $9, $10)
       RETURNING id, version`,
      [
        input.tripId,
        view.origin,
        input.destinationId,
        view.depart_on,
        view.return_on ?? view.depart_on,
        view.price_minor,
        view.currency,
        FARE_SOURCE,
        view.fetched_at,
        now,
      ],
    );
    const quote = inserted.rows[0];
    if (quote === undefined) throw new Error('price quote insert returned no row');
    return {
      quote_id: quote.id,
      amount_minor: view.price_minor,
      currency: view.currency,
      fetched_at: view.fetched_at ?? now.toISOString(),
      frozen_at: now.toISOString(),
      version: quote.version,
    };
  });
}
