/**
 * Tip detectors: deterministic checks over the places a crew is weighing and the airports its
 * members fly from (every number comes from code). Each returns facts,
 * never text:
 *
 * - fare drop: tonight's fare at least `minDropPct` under the median of the stored nightly
 *   observations (the fare calendars keep the last 8 nights);
 * - book by: a fare two or more months out that has risen at least 5 % across the stored nights;
 *   the deadline is the first day of the month before travel;
 * - season peak: a reviewed season event (blossoms, foliage, a festival) starting within 180 days;
 * - crowd dip: among the next six months, the quietest one when it is clearly quieter than the
 *   busiest (15 points or more on the 0–100 crowd index).
 */
import type { TipFact } from '@cp/ai';
import { airportDataset } from '@cp/content/airports';
import { homeBaseFor, type FarePriceObservation } from '@cp/domain';
import type pg from 'pg';

export const DEFAULT_MIN_FARE_DROP_PCT = 15;
export const BOOK_BY_MIN_RISE_PCT = 5;
export const SEASON_LOOKAHEAD_DAYS = 180;
export const CROWD_DIP_MIN_POINTS = 15;

export interface TipCandidate {
  readonly placeId: string;
  readonly place: string;
}

/** Adds places a crew is weighing (the destination poll registers its candidates here). */
export type TipCandidateSource = (tx: pg.PoolClient, crewId: string) => Promise<TipCandidate[]>;

const candidateSources: TipCandidateSource[] = [];

export function registerTipCandidateSource(source: TipCandidateSource): void {
  candidateSources.push(source);
}

/** The destinations of the crew's trips still being planned, plus registered sources. */
export async function tipCandidates(tx: pg.PoolClient, crewId: string): Promise<TipCandidate[]> {
  const { rows } = await tx.query<{ id: string; name: string }>(
    `SELECT DISTINCT d.id, d.name FROM trips t JOIN destinations d ON d.id = t.destination_id
      WHERE t.crew_id = $1 AND t.status IN
        ('voting', 'won', 'setup', 'drafting', 'draft_review', 'redrafting', 'proposed', 'confirmed')`,
    [crewId],
  );
  const all = rows.map((row) => ({ placeId: row.id, place: row.name }));
  for (const source of candidateSources) all.push(...(await source(tx, crewId)));
  const seen = new Set<string>();
  return all.filter((candidate) => !seen.has(candidate.placeId) && seen.add(candidate.placeId));
}

export interface Origin {
  readonly iata: string;
  readonly city: string | null;
}

export async function crewOrigins(tx: pg.PoolClient, crewId: string): Promise<Origin[]> {
  const { rows } = await tx.query<{ iata: string }>(
    `SELECT DISTINCT upper(u.home_airport) AS iata FROM crew_members m JOIN users u ON u.id = m.user_id
      WHERE m.crew_id = $1 AND m.status = 'active' AND u.home_airport IS NOT NULL`,
    [crewId],
  );
  const dataset = airportDataset();
  return rows.map((row) => ({
    iata: row.iata,
    city: homeBaseFor(dataset, row.iata)?.city ?? null,
  }));
}

export interface FareCellRow {
  readonly destination_id: string;
  readonly origin_iata: string;
  readonly month: string;
  readonly price_minor: number | null;
  readonly currency: string;
  readonly price_history: readonly FarePriceObservation[];
}

/** Calendar arithmetic on `YYYY-MM-DD` strings (UTC, no zone involved). */
function shiftDate(date: string, months: number, days = 0): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d + days)).toISOString().slice(0, 10);
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

/** A fare at least `minPct` under the median of the nights before today. */
export function fareDropFact(
  cell: FareCellRow,
  candidate: TipCandidate,
  origin: Origin,
  today: string,
  minPct: number,
): TipFact | null {
  if (cell.price_minor === null) return null;
  const before = cell.price_history.filter((entry) => entry.on < today);
  if (before.length < 2) return null;
  const typical = median(before.map((entry) => entry.price_minor));
  if (typical <= 0) return null;
  const deltaPct = Math.floor(((typical - cell.price_minor) / typical) * 100);
  if (deltaPct < minPct) return null;
  return {
    kind: 'fare_drop',
    place_id: candidate.placeId,
    place: candidate.place,
    value_minor: cell.price_minor,
    currency: cell.currency,
    date: cell.month,
    origin: origin.iata,
    origin_city: origin.city,
    delta_pct: deltaPct,
  };
}

/** A fare two or more months out that keeps rising: book by the first of the month before. */
export function bookByFact(
  cell: FareCellRow,
  candidate: TipCandidate,
  origin: Origin,
  today: string,
): TipFact | null {
  if (cell.price_minor === null) return null;
  const history = [...cell.price_history].sort((a, b) => a.on.localeCompare(b.on));
  const first = history[0];
  const last = history[history.length - 1];
  if (history.length < 3 || first === undefined || last === undefined || first.price_minor <= 0) {
    return null;
  }
  const risePct = ((last.price_minor - first.price_minor) / first.price_minor) * 100;
  if (risePct < BOOK_BY_MIN_RISE_PCT) return null;
  if (cell.month < shiftDate(today, 2)) return null;
  const deadline = firstOfMonth(shiftDate(firstOfMonth(cell.month), -1));
  if (deadline < shiftDate(today, 0, 7)) return null;
  return {
    kind: 'book_by',
    place_id: candidate.placeId,
    place: candidate.place,
    value_minor: cell.price_minor,
    currency: cell.currency,
    date: deadline,
    origin: origin.iata,
    origin_city: origin.city,
  };
}

export interface SeasonMonthRow {
  readonly month: number;
  readonly crowd_index: number;
}

/** The quietest of the next six months, when it is clearly quieter than the busiest of them. */
export function crowdDipFact(
  months: readonly SeasonMonthRow[],
  candidate: TipCandidate,
  today: string,
): TipFact | null {
  const start = firstOfMonth(today);
  const ahead = Array.from({ length: 6 }, (_, index) => shiftDate(start, index + 1));
  const indexed = ahead
    .map((date) => ({ date, row: months.find((row) => row.month === Number(date.slice(5, 7))) }))
    .filter((entry): entry is { date: string; row: SeasonMonthRow } => entry.row !== undefined);
  if (indexed.length < 2) return null;
  const quiet = indexed.reduce((a, b) => (b.row.crowd_index < a.row.crowd_index ? b : a));
  const busy = Math.max(...indexed.map((entry) => entry.row.crowd_index));
  if (busy - quiet.row.crowd_index < CROWD_DIP_MIN_POINTS) return null;
  return {
    kind: 'crowd_dip',
    place_id: candidate.placeId,
    place: candidate.place,
    value_minor: null,
    currency: null,
    date: quiet.date,
    origin: null,
    crowd_index: quiet.row.crowd_index,
  };
}

/** Every fact the detectors find for the crew's places today. */
export async function detectTipFacts(
  tx: pg.PoolClient,
  crewId: string,
  today: string,
  minDropPct: number,
): Promise<TipFact[]> {
  const candidates = await tipCandidates(tx, crewId);
  if (candidates.length === 0) return [];
  const origins = await crewOrigins(tx, crewId);
  const byId = new Map(candidates.map((candidate) => [candidate.placeId, candidate]));
  const ids = candidates.map((candidate) => candidate.placeId);
  const facts: TipFact[] = [];

  if (origins.length > 0) {
    const cells = await tx.query<FareCellRow>(
      `SELECT destination_id, origin_iata, month::text AS month,
              price_minor::double precision AS price_minor, currency, price_history
         FROM fare_cells
        WHERE destination_id = ANY ($1::uuid[]) AND origin_iata = ANY ($2::text[])
          AND month >= date_trunc('month', $3::date)`,
      [ids, origins.map((origin) => origin.iata), today],
    );
    for (const cell of cells.rows) {
      const candidate = byId.get(cell.destination_id);
      const origin = origins.find((entry) => entry.iata === cell.origin_iata);
      if (candidate === undefined || origin === undefined) continue;
      const drop = fareDropFact(cell, candidate, origin, today, minDropPct);
      if (drop !== null) facts.push(drop);
      const bookBy = bookByFact(cell, candidate, origin, today);
      if (bookBy !== null) facts.push(bookBy);
    }
  }

  const events = await tx.query<{ destination_id: string; name: string; starts_on: string }>(
    `SELECT destination_id, name, starts_on::text AS starts_on FROM season_events
      WHERE destination_id = ANY ($1::uuid[]) AND reviewed_at IS NOT NULL
        AND kind IN ('blossom', 'foliage', 'festival', 'ceremony')
        AND starts_on > $2::date AND starts_on <= $2::date + $3::int
      ORDER BY starts_on`,
    [ids, today, SEASON_LOOKAHEAD_DAYS],
  );
  for (const event of events.rows) {
    const candidate = byId.get(event.destination_id);
    if (candidate === undefined) continue;
    facts.push({
      kind: 'season_peak',
      place_id: candidate.placeId,
      place: candidate.place,
      value_minor: null,
      currency: null,
      date: event.starts_on,
      origin: null,
      event: event.name,
    });
  }

  const months = await tx.query<SeasonMonthRow & { destination_id: string }>(
    'SELECT destination_id, month, crowd_index FROM season_months WHERE destination_id = ANY ($1::uuid[])',
    [ids],
  );
  for (const candidate of candidates) {
    const dip = crowdDipFact(
      months.rows.filter((row) => row.destination_id === candidate.placeId),
      candidate,
      today,
    );
    if (dip !== null) facts.push(dip);
  }
  return facts;
}
