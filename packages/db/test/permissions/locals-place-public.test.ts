/**
 * `public.locals_place_public`, the view behind the public locals page: `public_reader` sees the
 * one place named in the transaction, with an allow-list of columns that carries a rarity tier and
 * a body shape per critter and nothing else about it. Critter names, art, notes, forms, spawn
 * rules, geofences and collections stay unreachable for the role, through the view or directly.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

async function asPublicReader<T>(
  place: string | null,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE public_reader');
    if (place !== null)
      await client.query("SELECT set_config('app.public_place', $1, true)", [place]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const places = (place: string | null) =>
  asPublicReader(
    place,
    async (tx) =>
      (await tx.query<Record<string, unknown>>('SELECT * FROM public.locals_place_public')).rows,
  );

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  await withSystem(db.pool, async (tx) => {
    const one = async (sql: string, params: unknown[] = []) =>
      (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
    const finder = await insertUser(tx, { username: 'finder' });
    const release = (kind: string, status: string) =>
      one(
        `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
           artifact, item_count, approved_by, approved_at)
         VALUES ($1, 1, $2, 'locals', $3, 'publish', repeat('c', 64), '{}', 1, $4, now())
         RETURNING id`,
        [kind, `locals-${kind}-${status}`, status, finder],
      );
    const live = await release('critters', 'published');
    const old = await release('forms', 'superseded');
    const japan = await one(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ('jp', 'Japan', 'JP', 2, 'Asia/Tokyo', 'JPY', '{ja}', 'live', 'cp-061', '[]', $1)
       RETURNING id`,
      [live],
    );
    await tx.query(
      `INSERT INTO destinations (slug, name, coverage, critter_set_id, critter_key)
       VALUES ('jp-kyoto', 'Kyoto', 'live', $1, 'cp-061'), ('jp-nara', 'Nara', 'live', $1, 'cp-062'),
              ('jp-uji', 'Uji', 'area', $1, NULL), ('xx-bare', 'Bare', 'guest', NULL, NULL)`,
      [japan],
    );
    const critter = (no: number, art: string, releaseId: string) =>
      one(
        `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
         VALUES ($1, $2, $3, 'Kyoto', 'Tanuki', $4, 7, 'Keeps odd hours.', $5) RETURNING id`,
        [`cp-0${no}`, japan, no, art, releaseId],
      );
    const pon = await critter(61, '{"b":"sit","c":["#aa8855","#553311","#ffeecc"]}', live);
    await critter(62, '{"b":"wader","c":["#ffffff","#222222","#eeeeee"]}', live);
    await critter(63, '{"b":"frog","c":["#00aa00","#005500","#ccffcc"]}', old);
    const form = (rarity: string, releaseId: string) =>
      one(
        `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
         VALUES ($1, $2, $3, '{"f":"#ff00aa"}', 'none', 'Blossom week.', 'Under the blossoms after dark', 150, $4)
         RETURNING id`,
        [`cp-061:${rarity}`, pon, rarity, releaseId],
      );
    const epic = await form('epic', live);
    await form('legendary', old);
    await tx.query(
      `INSERT INTO critter_names (critter_id, form_id, locale, name, name_native, release_id)
       VALUES ($1, NULL, 'en', 'Pon', 'ポン', $2)`,
      [pon, live],
    );
    await tx.query(
      `INSERT INTO spawn_rules (key, form_id, kind, set_id, geofences, copy, release_id)
       VALUES ('cp-061:epic:presence', $1, 'presence', $2,
         '[{"lat":35.0116,"lng":135.7681,"radius_m":250}]', 'By the Kamo river', $3)`,
      [epic, japan, live],
    );
    await tx.query(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source, verification)
       VALUES ($1, $2, $3, now(), 'encounter', 'verified')`,
      [finder, epic, pon],
    );
    const photo = (sourceId: string, subject: string, rank: number, status: string) =>
      tx.query(
        `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
           rank, author, licence, licence_url, attribution_required, credit, blurhash, variants, status)
         VALUES ('photo', 'pexels', $1, 'https://www.pexels.com/photo/1', 'https://images.pexels.com/1.jpg',
           ARRAY[$2], $3, 'Aiko T.', 'pexels', 'https://www.pexels.com/license/', false, $4, $5, $6, $7)`,
        [
          sourceId,
          subject,
          rank,
          `Photo: Aiko T. · Pexels (${sourceId})`,
          status === 'ready' ? 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' : null,
          status === 'ready'
            ? `[{"key":"c/media/${sourceId}/640.webp","format":"webp","w":640,"h":427,"bytes":1},
                {"key":"c/media/${sourceId}/1280.webp","format":"webp","w":1280,"h":853,"bytes":2}]`
            : '[]',
          status,
        ],
      );
    await photo('later', 'destination:jp-kyoto', 2, 'ready');
    await photo('hero', 'destination:jp-kyoto', 0, 'ready');
    await photo('unready', 'destination:jp-kyoto', 0, 'pending');
    await photo('elsewhere', 'destination:jp-osaka', 0, 'ready');
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('public.locals_place_public', () => {
  it('shows the named place, its first ready photo with credit and its live critters as silhouettes', async () => {
    expect(await places('jp-kyoto')).toEqual([
      {
        slug: 'jp-kyoto',
        name: 'Kyoto',
        area: 'Japan',
        photo: {
          key: 'c/media/hero/1280.webp',
          width: 1280,
          height: 853,
          credit: 'Photo: Aiko T. · Pexels (hero)',
          source_url: 'https://www.pexels.com/photo/1',
        },
        // The rarest tier of a live form only; a critter of a superseded release is left out.
        critters: [
          { rarity: 'epic', silhouette: 'sit' },
          { rarity: 'common', silhouette: 'wader' },
        ],
      },
    ]);
  });

  it('shows a place without a photo, and nothing for an area, a bare place, an unknown slug or no slug', async () => {
    expect(await places('jp-nara')).toMatchObject([{ slug: 'jp-nara', photo: null }]);
    for (const slug of ['jp-uji', 'xx-bare', 'jp-osaka', ''])
      expect(await places(slug)).toEqual([]);
    expect(await places(null)).toEqual([]);
  });

  it('carries only its allow-listed columns', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'locals_place_public'
        ORDER BY ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'slug',
      'name',
      'area',
      'photo',
      'critters',
    ]);
  });

  it('never carries a name, key, species, colour, note, hint, geofence or finder', async () => {
    const text = JSON.stringify(await places('jp-kyoto'));
    for (const secret of [
      'Pon',
      'ポン',
      'Tanuki',
      'cp-06',
      '#aa8855',
      '#ff00aa',
      'odd hours',
      'Blossom',
      'blossoms',
      'Kamo',
      '35.0116',
      'radius',
      'finder',
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('public_reader and the critter catalogue', () => {
  it('is denied a direct read of critters, their names, forms, spawn rules, finds and photos', async () => {
    for (const table of [
      'critters',
      'critter_names',
      'critter_forms',
      'critter_sets',
      'spawn_rules',
      'legendary_windows',
      'collection_entries',
      'encounters',
      'destinations',
      'media_assets',
      'content_releases',
    ]) {
      await expect(
        asPublicReader('jp-kyoto', (tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot call the function that hands a found critter its name', async () => {
    const { rows } = await db.pool.query<{ allowed: boolean }>(
      `SELECT bool_or(has_function_privilege('public_reader', p.oid, 'EXECUTE')) AS allowed
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'set_collected_name'`,
    );
    expect(rows[0]?.allowed).toBe(false);
    await expect(
      asPublicReader('jp-kyoto', (tx) => tx.query('SELECT app.guide_slug($1)', ['Pon'])),
    ).rejects.toThrow(/permission denied/);
  });
});
