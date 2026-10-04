/**
 * What changes for a city once guides go by city, against a migrated Postgres: a Đà Lạt pitch is
 * made for Ngựa only while the switch is on and for the place's guide otherwise, and the migration
 * that re-colours the guide rows changes the accent of a row an earlier backfill wrote, leaves its
 * slug and named colour alone, writes nothing the second time and makes the switch a public key
 * without changing its value.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { GUIDE_FACTS } from '@cp/critter-art/guides';
import { GUIDES_PER_CITY_KEY, loadPitchFacts, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-20T08:00:00Z');
const MIGRATIONS = path.resolve(import.meta.dirname, '../../../../packages/db/migrations');

let harness: JobsHarness;
let crewId: string;
let daLat: string;
let daNang: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await q<T>(sql, params);
  if (row === undefined) throw new Error(`no row: ${sql}`);
  return row;
}

const setSwitch = (on: boolean) =>
  q('UPDATE ops.ops_config SET value = $2::jsonb WHERE key = $1', [
    GUIDES_PER_CITY_KEY,
    JSON.stringify(on),
  ]);

const pitchGuide = async (placeId: string) =>
  (
    await withSystem(harness.pool, (tx) =>
      loadPitchFacts(tx, { crewId, placeId, month: null, now: NOW }),
    )
  )?.facts.place.guide;

beforeAll(async () => {
  harness = await startJobsHarness();
  const organiser = randomUUID();
  await q(
    "INSERT INTO users (id, status, home_airport, display_name) VALUES ($1, 'registered', 'SGN', 'Linh Tran')",
    [organiser],
  );
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Guide crew', $1) RETURNING id",
    [organiser],
  ));
  await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')", [
    crewId,
    organiser,
  ]);
  ({ id: daNang } = await one<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh')
     RETURNING id`,
  ));
  const { id: release } = await one<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('critters', 1, 'critters-1', 'critters-1', 'published', 'review', repeat('a', 64), '{}', 2,
       $1, now()) RETURNING id`,
    [organiser],
  );
  const { id: vietnam } = await one<{ id: string }>(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       guide_slug, destination_id, hero_critter_key, month_hints, release_id)
     VALUES ('vn', 'Vietnam', 'VN', 0, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'chava', $1,
       'cp-151', '[]', $2) RETURNING id`,
    [daNang, release],
  );
  for (const key of ['cp-006', 'cp-151']) {
    const facts = GUIDE_FACTS.find((entry) => entry.key === key)!;
    const artParams = facts.colours === null ? { k: 'langur' } : { b: 'stand', c: facts.colours };
    const { id } = await one<{ id: string }>(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, $4, $5, $6, 7, 'note', $7) RETURNING id`,
      [key, vietnam, Number(key.slice(3)), facts.city, facts.species, artParams, release],
    );
    await q(
      "INSERT INTO critter_names (critter_id, form_id, locale, name, release_id) VALUES ($1, NULL, 'en', $2, $3)",
      [id, facts.name, release],
    );
  }
  // Ngựa's row as the first backfill wrote it: the off-white fill, named cream.
  await q(
    `INSERT INTO guides (slug, name, colour, accent, critter_key)
     VALUES ('ngua', 'Ngựa', 'cream', '#fff1d6', 'cp-006')`,
  );
  ({ id: daLat } = await one<{ id: string }>(
    "SELECT id FROM destinations WHERE slug = 'vn-da-lat'",
  ));
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('a pitch for a city', () => {
  it("is made for the place's guide while the switch is off", async () => {
    await setSwitch(false);
    expect(await pitchGuide(daLat)).toBe('chava');
    expect(await pitchGuide(daNang)).toBe('chava');
  });

  it("is made for the city's own critter once the switch is on", async () => {
    await setSwitch(true);
    expect(await pitchGuide(daLat)).toBe('ngua');
    expect(await pitchGuide(daNang)).toBe('chava');
    await setSwitch(false);
  });
});

describe('the migration that re-colours the guide rows', () => {
  const ngua = () =>
    one<{ slug: string; colour: string; accent: string; xmin: string }>(
      "SELECT slug, colour, accent, xmin::text FROM guides WHERE critter_key = 'cp-006'",
    );
  const switchRow = () =>
    one<{ value: unknown; is_public: boolean; synced: unknown }>(
      `SELECT c.value, c.is_public,
              (SELECT to_jsonb(p.value) FROM client_config p WHERE p.key = c.key) AS synced
         FROM ops.ops_config c WHERE c.key = $1`,
      [GUIDES_PER_CITY_KEY],
    );

  it('changes the accent of a row written before it, and nothing on a second run', async () => {
    const file = readdirSync(MIGRATIONS).find((name) =>
      name.endsWith('_guide_accents_from_strongest_colour.sql'),
    );
    const sql = readFileSync(path.join(MIGRATIONS, file ?? ''), 'utf8');
    // The harness already applied it once, before these rows existed: the state it left.
    expect(await switchRow()).toMatchObject({ value: false, is_public: true, synced: false });

    await harness.pool.query(sql);
    const first = await ngua();
    expect(first).toMatchObject({ slug: 'ngua', colour: 'cream', accent: '#ff8fbf' });
    expect(await q("SELECT 1 FROM guides WHERE slug = 'chava'")).toHaveLength(1);

    await harness.pool.query(sql);
    expect((await ngua()).xmin).toBe(first.xmin);
    expect(await switchRow()).toMatchObject({ value: false, is_public: true, synced: false });
  });
});
