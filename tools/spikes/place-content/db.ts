/**
 * Read-only staging reads for the spike: the sample places with their reviewed notes (the gold
 * set), a destination's curated essentials, and the name check that says whether a place a model
 * named is one of our rows. Every query runs in a READ ONLY transaction.
 */
import pg from 'pg';

import type { NamedPlace } from '../../../packages/ai/src/routes/place-picks';
import {
  matchNamedPlace,
  plainWords,
  searchWords,
  type PickCandidate,
} from '../../../services/worker/src/places/pick/match';

export const DESTINATIONS = {
  'vn-da-lat': { id: '01a0ed04-523e-7014-8a11-1c731cedb9b0', name: 'Đà Lạt', en: 'Da Lat' },
  'vn-hue': { id: '01a0ed04-5233-7b46-9462-dbf54bccc918', name: 'Huế', en: 'Hue' },
} as const;
export type DestinationSlug = keyof typeof DESTINATIONS;

/** The sample: [destination, name as stored, group]. */
export const SAMPLE: readonly (readonly [DestinationSlug, string, string])[] = [
  ['vn-da-lat', 'Crazy House', 'essential'],
  ['vn-da-lat', 'Datanla Falls', 'essential'],
  ['vn-da-lat', 'Bảo Đại Summer Palace (Dinh III)', 'essential'],
  ['vn-da-lat', 'Lam Dong Museum', 'must_see'],
  ['vn-da-lat', 'Tuyền Lâm Lake', 'must_see'],
  ['vn-da-lat', 'Mộng Mơ Hill', 'must_see'],
  ['vn-da-lat', 'Nem Nướng Bà Hùng', 'food'],
  ['vn-da-lat', 'Liên Hoa Bakery', 'food'],
  ['vn-da-lat', 'An Cafe', 'food'],
  ['vn-da-lat', 'Le Rabelais', 'food'],
  ['vn-hue', 'Kinh Thành Huế (Hue Imperial City)', 'sight'],
  ['vn-hue', 'Chùa Thiên Mụ (Thien Mu Pagoda)', 'sight'],
  ['vn-hue', 'Lăng Khải Định (Khai Dinh Tomb)', 'sight'],
  ['vn-hue', 'Chợ Đông Ba', 'sight'],
  ['vn-hue', 'Hue Museum of Royal Antiquities', 'sight'],
  ['vn-hue', 'Chùa Từ Hiếu', 'sight'],
  ['vn-hue', 'Madam Thu Restaurant', 'food'],
  ['vn-hue', 'Quán Hạnh', 'food'],
  ['vn-hue', 'Cơm hến Hoa Đông', 'food'],
  ['vn-hue', 'Vỹ Dạ Xưa Café', 'food'],
];

export interface SamplePlace {
  readonly id: string;
  readonly destination: DestinationSlug;
  readonly group: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly hours: unknown;
  readonly website: string | null;
  /** The reviewed note without photos; `null` when the place has none. */
  readonly gold: Record<string, unknown> | null;
}

export async function withReadOnly<T>(run: (client: pg.ClientBase) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await run(client);
    await client.query('ROLLBACK');
    return result;
  } finally {
    await client.end();
  }
}

export async function loadSample(client: pg.ClientBase): Promise<SamplePlace[]> {
  const places: SamplePlace[] = [];
  for (const [destination, name, group] of SAMPLE) {
    const { rows } = await client.query<{
      id: string;
      name: string;
      name_local: string | null;
      category: string;
      lat: number;
      lng: number;
      address: string | null;
      hours: unknown;
      website: string | null;
      editorial: Record<string, unknown>;
    }>(
      `SELECT id, name, name_local, category, lat, lng, address, hours, website, editorial
         FROM pois WHERE destination_id = $1 AND name = $2 AND status = 'active'
        ORDER BY (editorial ? 'why_go') DESC, pick_rank NULLS LAST LIMIT 1`,
      [DESTINATIONS[destination].id, name],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`sample place missing: ${name}`);
    const { photos: _photos, ...note } = row.editorial;
    places.push({
      id: row.id,
      destination,
      group,
      name: row.name,
      nameLocal: row.name_local,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      hours: row.hours,
      website: row.website,
      gold: 'why_go' in note ? note : null,
    });
  }
  return places;
}

export interface CuratedPlace {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly essential: boolean;
  readonly mustSee: boolean;
}

export async function loadCurated(
  client: pg.ClientBase,
  destination: DestinationSlug,
): Promise<CuratedPlace[]> {
  const { rows } = await client.query<{
    id: string;
    name: string;
    name_local: string | null;
    e: boolean | null;
    m: boolean | null;
  }>(
    `SELECT id, name, name_local, (editorial->>'essential')::bool e, (editorial->>'must_see')::bool m
       FROM pois WHERE destination_id = $1 AND status = 'active'
        AND ((editorial->>'essential')::bool OR (editorial->>'must_see')::bool)`,
    [DESTINATIONS[destination].id],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameLocal: r.name_local,
    essential: r.e === true,
    mustSee: r.m === true,
  }));
}

export async function loadPicks(
  client: pg.ClientBase,
  destination: DestinationSlug,
): Promise<{ id: string; name: string }[]> {
  const { rows } = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM pois WHERE destination_id = $1 AND status = 'active' AND pick_rank IS NOT NULL
      ORDER BY pick_rank LIMIT 30`,
    [DESTINATIONS[destination].id],
  );
  return rows;
}

/** Our row for a named place, by the same rules `places.pick` uses (all rows, curated too). */
export async function matchName(
  client: pg.ClientBase,
  destination: DestinationSlug,
  lead: NamedPlace,
): Promise<PickCandidate | null> {
  const plain = plainWords(DESTINATIONS[destination].name, 'Vietnam');
  const words = searchWords(lead, plain);
  if (words.length === 0) return null;
  const { rows } = await client.query<{
    id: string;
    name: string;
    name_local: string | null;
    category: string;
    lat: number;
    lng: number;
    address: string | null;
    quality: number;
  }>(
    `SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
            coalesce(p.confidence, 0)::float8 AS quality
       FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND p.fts @@ to_tsquery('simple', $2)
      ORDER BY greatest(similarity(p.name, $3), similarity(p.name, $4),
                        similarity(coalesce(p.name_local, ''), $4)) DESC, p.id
      LIMIT 40`,
    [DESTINATIONS[destination].id, words.join(' | '), lead.name, lead.localName ?? lead.name],
  );
  const candidates: PickCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameLocal: r.name_local,
    category: r.category,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    quality: r.quality,
  }));
  return matchNamedPlace(lead, candidates, plain);
}
