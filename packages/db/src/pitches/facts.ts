/**
 * The pitch tools, read from the database (the model sees only what these return):
 *
 * - `get_fare_calendar`: the freshest fare for the pitched month from each crew home airport.
 * - `get_travel_time`: the flight time on those fares.
 * - `get_season_events`: dated events around the month and the quietest good months.
 * - `get_crew_taste_tags`: crew-visible taste tags of the active members (never budgets).
 * - `suggest_alternatives`: a cheaper guide destination from the same airport, or another city of
 *   the same place.
 *
 * Supplier content is never read. The fare snapshot id fingerprints the fares used, so a cached
 * pitch is replaced once any of its prices moves.
 */
import { createHash } from 'node:crypto';

import {
  isFareStale,
  PITCH_MAX_ALTERNATIVES,
  type PitchAlternative,
  type PitchFacts,
  type PitchFare,
} from '@cp/domain';
import type pg from 'pg';

export interface PitchFactsInput {
  readonly crewId: string;
  readonly placeId: string;
  /** Travel month 1–12; the next month when absent. */
  readonly month: number | null;
  readonly now: Date;
}

export interface LoadedPitchFacts {
  readonly facts: PitchFacts;
  readonly fareSnapshotId: string;
  /** `YYYY-MM-01` the fares are for. */
  readonly fareMonth: string;
}

function monthStart(now: Date, month: number | null): string {
  const current = now.getUTCMonth() + 1;
  const wanted = month ?? (current % 12) + 1;
  const year = now.getUTCFullYear() + (wanted < current ? 1 : 0);
  return `${year}-${String(wanted).padStart(2, '0')}-01`;
}

interface PlaceRow {
  id: string;
  name: string;
  country: string | null;
  coverage: 'live' | 'guest';
  guide: string | null;
  /** The guide of the destination's own critter, while guides go by city. */
  city_guide: string | null;
  set_id: string | null;
  month_hints: { crowd: number }[] | null;
}

async function loadPlace(tx: pg.PoolClient, placeId: string): Promise<PlaceRow | undefined> {
  const { rows } = await tx.query<PlaceRow>(
    `SELECT d.id, d.name, d.country, d.coverage, s.guide_slug AS guide, s.id AS set_id, s.month_hints,
            (SELECT g.slug FROM guides g
              WHERE g.critter_key = d.critter_key AND app.guides_per_city()) AS city_guide
       FROM destinations d LEFT JOIN critter_sets s ON s.id = d.critter_set_id
      WHERE d.id = $1`,
    [placeId],
  );
  return rows[0];
}

interface FareRow {
  id: string;
  origin_iata: string;
  destination_id: string;
  price_minor: string | null;
  currency: string;
  transfers: number | null;
  duration_min: number | null;
  fastest_duration_min: number | null;
  fetched_at: Date | null;
}

async function freshFares(
  tx: pg.PoolClient,
  destinationIds: readonly string[],
  origins: readonly string[],
  month: string,
  now: Date,
): Promise<FareRow[]> {
  if (origins.length === 0 || destinationIds.length === 0) return [];
  const { rows } = await tx.query<FareRow>(
    `SELECT id, origin_iata, destination_id, price_minor, currency, transfers, duration_min,
            fastest_duration_min, fetched_at
       FROM fare_cells
      WHERE destination_id = ANY ($1::uuid[]) AND origin_iata = ANY ($2::text[]) AND month = $3`,
    [destinationIds, origins, month],
  );
  return rows.filter((row) => row.price_minor !== null && !isFareStale(row.fetched_at, now));
}

async function bestMonths(tx: pg.PoolClient, place: PlaceRow): Promise<number[]> {
  const { rows } = await tx.query<{ month: number }>(
    `SELECT month FROM season_months WHERE destination_id = $1
      ORDER BY (colour_role = 'best') DESC, crowd_index, month LIMIT 2`,
    [place.id],
  );
  if (rows.length > 0) return rows.map((row) => row.month).sort((a, b) => a - b);
  const hints = place.month_hints ?? [];
  return hints
    .map((hint, i) => ({ month: i + 1, crowd: hint.crowd }))
    .sort((a, b) => a.crowd - b.crowd || a.month - b.month)
    .slice(0, 2)
    .map((hint) => hint.month)
    .sort((a, b) => a - b);
}

async function alternatives(
  tx: pg.PoolClient,
  place: PlaceRow,
  main: FareRow | undefined,
  month: string,
  now: Date,
): Promise<PitchAlternative[]> {
  const picks: PitchAlternative[] = [];
  if (main !== undefined && main.price_minor !== null) {
    const others = await tx.query<{ id: string; name: string }>(
      "SELECT id, name FROM destinations WHERE coverage = 'live' AND id <> $1",
      [place.id],
    );
    const names = new Map(others.rows.map((row) => [row.id, row.name]));
    const cheaper = (await freshFares(tx, [...names.keys()], [main.origin_iata], month, now))
      .filter(
        (row) =>
          row.currency === main.currency && Number(row.price_minor) < Number(main.price_minor),
      )
      .sort((a, b) => Number(a.price_minor) - Number(b.price_minor))[0];
    if (cheaper !== undefined) {
      picks.push({
        place_id: cheaper.destination_id,
        name: names.get(cheaper.destination_id) ?? '',
        kind: 'cheaper',
        delta_minor: Number(main.price_minor) - Number(cheaper.price_minor),
        currency: main.currency,
      });
    }
  }
  if (place.set_id !== null) {
    const { rows } = await tx.query<{ id: string; name: string }>(
      'SELECT id, name FROM destinations WHERE critter_set_id = $1 AND id <> $2 ORDER BY name LIMIT 2',
      [place.set_id, place.id],
    );
    for (const row of rows) {
      if (picks.length >= PITCH_MAX_ALTERNATIVES) break;
      if (picks.some((pick) => pick.place_id === row.id)) continue;
      picks.push({
        place_id: row.id,
        name: row.name,
        kind: 'nearby',
        delta_minor: null,
        currency: null,
      });
    }
  }
  return picks.slice(0, PITCH_MAX_ALTERNATIVES);
}

export async function loadPitchFacts(
  tx: pg.PoolClient,
  input: PitchFactsInput,
): Promise<LoadedPitchFacts | undefined> {
  const place = await loadPlace(tx, input.placeId);
  if (place === undefined) return undefined;
  const { rows: crews } = await tx.query<{ name: string }>('SELECT name FROM crews WHERE id = $1', [
    input.crewId,
  ]);
  const { rows: members } = await tx.query<{
    user_id: string;
    home_airport: string | null;
    tags: string[] | null;
    visibility: string | null;
  }>(
    `SELECT m.user_id, u.home_airport, t.tags, t.visibility
       FROM crew_members m JOIN users u ON u.id = m.user_id
       LEFT JOIN taste_profiles t ON t.user_id = m.user_id
      WHERE m.crew_id = $1 AND m.status = 'active'`,
    [input.crewId],
  );
  const month = monthStart(input.now, input.month);
  const origins = new Map<string, number>();
  for (const member of members) {
    if (member.home_airport !== null) {
      origins.set(member.home_airport, (origins.get(member.home_airport) ?? 0) + 1);
    }
  }
  const fareRows = await freshFares(tx, [place.id], [...origins.keys()], month, input.now);
  const fares: PitchFare[] = fareRows.map((row) => ({
    origin: row.origin_iata,
    members: origins.get(row.origin_iata) ?? 1,
    price_minor: Number(row.price_minor),
    currency: row.currency,
    duration_min: row.fastest_duration_min ?? row.duration_min,
    transfers: row.transfers,
    seen_at: row.fetched_at?.toISOString() ?? null,
  }));
  const main = [...fareRows].sort(
    (a, b) => (origins.get(b.origin_iata) ?? 0) - (origins.get(a.origin_iata) ?? 0),
  )[0];
  const { rows: events } = await tx.query<{ name: string; kind: string; starts_on: string }>(
    `SELECT name, kind, starts_on::text FROM season_events
      WHERE destination_id = $1 AND kind <> 'closure'
        AND starts_on >= $2::date - interval '7 days' AND starts_on < $2::date + interval '2 months'
      ORDER BY starts_on LIMIT 3`,
    [place.id, month],
  );
  const taste = new Map<string, string[]>();
  for (const member of members) {
    if (member.visibility === 'self') continue;
    for (const tag of member.tags ?? [])
      taste.set(tag, [...(taste.get(tag) ?? []), member.user_id]);
  }
  const facts: PitchFacts = {
    place: {
      id: place.id,
      name: place.name,
      country: place.country,
      coverage: place.coverage,
      guide: place.city_guide ?? (place.coverage === 'live' ? (place.guide ?? 'tokek') : 'tokek'),
    },
    crew: { name: crews[0]?.name ?? '', size: Math.max(1, members.length) },
    month: Number(month.slice(5, 7)),
    fares,
    season: { best_months: await bestMonths(tx, place), events },
    taste: [...taste]
      .map(([tag, ids]) => ({ tag, member_ids: ids.sort() }))
      .sort((a, b) => b.member_ids.length - a.member_ids.length || (a.tag < b.tag ? -1 : 1))
      .slice(0, 6),
    alternatives: await alternatives(tx, place, main, month, input.now),
  };
  const fingerprint = fareRows
    .map((row) => `${row.id}:${row.price_minor}:${row.fetched_at?.toISOString() ?? ''}`)
    .sort()
    .join('|');
  return {
    facts,
    fareMonth: month,
    fareSnapshotId: createHash('sha256')
      .update(`${month}|${fingerprint}`)
      .digest('hex')
      .slice(0, 32),
  };
}
