/**
 * Base-set destinations (class C0): every signed-in reader sees them, only the system writes them,
 * the ops console's reader sees the build's columns, and the critter-city sync never overwrites
 * what the build wrote on a row whose slug it takes over.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let baseId: string;

const TEXTS = { en: { line: 'A coastal city in Bình Định.', about: 'Facts only.' } };
const MATCH = { method: 'nearest', distance_km: 210 };

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  baseId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, country_code, origin, wikidata_qid, kind, lat,
         lng, names, texts, critter_key, critter_match, base_rank)
       VALUES ('vn-quy-nhon', 'Quy Nhơn', 'Vietnam', 'VN', 'base', 'Q1500', 'city', 13.77, 109.22,
         '{"vi": "Quy Nhơn", "en": "Quy Nhon"}', $1, 'cp-005', $2, 7.5)
       RETURNING id`,
      [JSON.stringify(TEXTS), JSON.stringify(MATCH)],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function asAdminReader<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE admin_reader');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('destinations base set (class C0, read-all, system writes)', () => {
  it('lets any signed-in reader read a base row and its unaccented search name', async () => {
    const actor = anonymousActor();
    const rows = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ slug: string; search_name: string; origin: string }>(
        'SELECT slug, search_name, origin FROM destinations WHERE id = $1',
        [baseId],
      );
      return rows;
    });
    expect(rows).toEqual([
      { slug: 'vn-quy-nhon', origin: 'base', search_name: 'quy nhon quy nhon quy nhon' },
    ]);
  });

  it('rejects an app_user write to a base row', async () => {
    const actor = anonymousActor();
    await expect(
      withUser(db.pool, actor.uid, actor.device, async (tx) => {
        await tx.query("UPDATE destinations SET texts = '{}' WHERE id = $1", [baseId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an unknown origin and a malformed Wikidata id', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("INSERT INTO destinations (slug, name, origin) VALUES ('x1', 'X', 'bogus')"),
      ),
    ).rejects.toThrow(/destinations_origin_check/);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("INSERT INTO destinations (slug, name, wikidata_qid) VALUES ('x2', 'X', 'P31')"),
      ),
    ).rejects.toThrow(/destinations_wikidata_qid_check/);
  });

  it('shows the build columns to the ops console reader', async () => {
    const row = await asAdminReader(async (tx) => {
      const { rows } = await tx.query<{ origin: string; critter_match: unknown; texts: unknown }>(
        `SELECT origin, wikidata_qid, geonames_id, country_code, admin1, kind, lat, lng, population,
                names, base_rank, critter_match, texts, base_built_at, search_name
           FROM destinations WHERE id = $1`,
        [baseId],
      );
      return firstRow(rows);
    });
    expect(row.origin).toBe('base');
    expect(row.critter_match).toEqual(MATCH);
  });

  it('keeps the build text, photo subject and match when a critter city takes the slug', async () => {
    await withSystem(db.pool, async (tx) => {
      const owner = await insertUser(tx, { username: 'curator' });
      const { rows: release } = await tx.query<{ id: string }>(
        `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
           artifact, item_count, approved_by, approved_at)
         VALUES ('critters', 1, 'vn', 'vn', 'published', 'publish', repeat('c', 64), '{}', 1, $1,
           now())
         RETURNING id`,
        [owner],
      );
      const releaseId = firstRow(release).id;
      const { rows: set } = await tx.query<{ id: string }>(
        `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages,
           coverage, hero_critter_key, month_hints, release_id)
         VALUES ('vn', 'Vietnam', 'VN', 0, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'cp-900',
           '[]', $1)
         RETURNING id`,
        [releaseId],
      );
      await tx.query(
        `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note,
           release_id)
         VALUES ('cp-900', $1, 900, 'Quy Nhơn', 'Sea turtle', '{}', 1, 'Swims the bay.', $2)`,
        [firstRow(set).id, releaseId],
      );
      await tx.query('SELECT app.sync_place_destinations()');
    });
    const row = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        name: string;
        origin: string;
        critter_key: string;
        critter_set_id: string | null;
        texts: unknown;
        critter_match: unknown;
        wikidata_qid: string;
      }>(
        `SELECT id, name, origin, critter_key, critter_set_id, texts, critter_match, wikidata_qid
           FROM destinations WHERE slug = 'vn-quy-nhon'`,
      );
      return firstRow(rows);
    });
    expect(row).toMatchObject({
      id: baseId,
      name: 'Quy Nhơn',
      origin: 'critter',
      critter_key: 'cp-900',
      texts: TEXTS,
      critter_match: MATCH,
      wikidata_qid: 'Q1500',
    });
    expect(row.critter_set_id).not.toBeNull();
  });
});
