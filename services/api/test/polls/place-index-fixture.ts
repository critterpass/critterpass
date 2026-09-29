/**
 * Seeds the real place index from the content factory's approved batches (the 61 places and
 * their 150 critter cities) as a published release, plus the six guide destinations the places
 * link to. The migration's trigger then gives every city its destination row.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type pg from 'pg';

const BATCHES = path.resolve(import.meta.dirname, '../../../../tools/content-factory/batches');

interface SetItem {
  code: string;
  name: string;
  country: string;
  rank: number | null;
  set_group: number;
  tz: string;
  currency: string;
  languages: string[];
  coverage: 'live' | 'guest';
  guide: string | null;
  destination: string | null;
  hero_critter_id: string;
  month_hints: unknown[];
}

interface CritterItem {
  id: string;
  no: number;
  set_code: string;
  city: string;
  species: string;
  name: string;
  art_params: unknown;
  canonical_seed: number;
  note: string;
}

function items<T>(kind: string): T[] {
  const dir = path.join(BATCHES, kind);
  const file = readFileSync(path.join(dir, `2026-09-27-${kind}-01.json`), 'utf8');
  return (JSON.parse(file) as { items: T[] }).items;
}

export const PLACE_SETS = items<SetItem>('sets');
export const PLACE_CRITTERS = items<CritterItem>('critters');

const GUIDE_DESTINATIONS: Readonly<Record<string, string>> = {
  'mexico-city': 'Mexico City',
  kyoto: 'Kyoto',
  lisbon: 'Lisbon',
  bali: 'Bali',
  cusco: 'Cusco',
  iceland: 'Iceland',
};

export async function seedPlaceIndex(pool: pg.Pool, approver: string): Promise<void> {
  for (const [slug, name] of Object.entries(GUIDE_DESTINATIONS)) {
    await pool.query(
      `INSERT INTO destinations (slug, name, coverage) VALUES ($1, $2, 'live') ON CONFLICT (slug) DO NOTHING`,
      [slug, name],
    );
  }
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('sets', 1, 'place-index', 'Place index', 'published', 'publish', repeat('0', 64), '{}', 0,
       $1, now(), now()) RETURNING id`,
    [approver],
  );
  const release = rows[0]!.id;
  const setIds = new Map<string, string>();
  for (const set of PLACE_SETS) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, rank, set_group, tz, currency, languages, coverage,
         guide_slug, destination_id, hero_critter_key, month_hints, release_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         (SELECT id FROM destinations WHERE slug = $11), $12, $13::jsonb, $14)
       RETURNING id`,
      [
        set.code,
        set.name,
        set.country,
        set.rank,
        set.set_group,
        set.tz,
        set.currency,
        set.languages,
        set.coverage,
        set.guide,
        set.destination,
        set.hero_critter_id,
        JSON.stringify(set.month_hints),
        release,
      ],
    );
    setIds.set(set.code, inserted.rows[0]!.id);
  }
  for (const critter of PLACE_CRITTERS) {
    await pool.query(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        critter.id,
        setIds.get(critter.set_code),
        critter.no,
        critter.city,
        critter.species,
        JSON.stringify(critter.art_params),
        critter.canonical_seed,
        critter.note,
        release,
      ],
    );
  }
}
