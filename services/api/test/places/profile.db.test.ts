/**
 * A place page's AI profile on a migrated Postgres with a real pg-boss producer: a place without
 * one queues one job (and only one while it waits), a ready profile answers in the reader's
 * language or in English while its translation is queued, and a place with a reviewed note never
 * gets a profile or a job.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withSystem, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { getPlaceDetail } from '../../src/places/detail';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let producer: PgBoss;
let english: string;
let french: string;
let destinationId: string;

const TEXT = {
  en: {
    why_go: 'The last emperor’s summer villa, its rooms and furniture intact.',
    best_time: 'Morning, before the tour groups',
    crowd: 'Busiest midday',
    facts: ['Adult ticket 60.000 VND'],
  },
  vi: {
    why_go: 'Biệt điện của vua Bảo Đại.',
    best_time: 'Buổi sáng',
    crowd: 'Đông nhất giữa trưa',
    facts: ['Vé người lớn 60.000 VND'],
  },
};

async function place(name: string, editorial: object = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, editorial)
     VALUES ($1, $2, 'museum', 11.93, 108.44, $3) RETURNING id`,
    [destinationId, name, JSON.stringify(editorial)],
  );
  return rows[0]?.id as string;
}

async function jobs(queue: string, poiId: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    "SELECT data FROM pgboss.job WHERE name = $1 AND data->>'poi_id' = $2",
    [queue, poiId],
  );
  return rows.map((row) => row.data);
}

const read = (uid: string, poiId: string) =>
  withUser(pool, uid, 'device-1', (tx) =>
    getPlaceDetail(tx, poiId, {
      profile: { uid, mediaBaseUrl: 'https://media.example.test' },
    }),
  ).then((detail) => detail.profile);

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  producer = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });
  english = randomUUID();
  french = randomUUID();
  await pool.query(
    "INSERT INTO users (id, status, locale) VALUES ($1, 'registered', 'en'), ($2, 'registered', 'fr')",
    [english, french],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]?.id as string;
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await pool?.end();
  await postgres?.stop();
});

describe('GET /v1/places/{id} profile', () => {
  it('queues one profile job for a place without one, and answers pending', async () => {
    const id = await place('Bảo Đại Summer Palace');
    expect(await read(english, id)).toEqual({ status: 'pending' });
    expect(await read(french, id)).toEqual({ status: 'pending' });
    expect(await jobs('places.profile', id)).toEqual([{ poi_id: id }]);
  });

  it("answers a ready profile in the reader's language, else English with a translation queued", async () => {
    const id = await place('Datanla Falls');
    await withSystem(pool, (tx) =>
      tx.query(
        `INSERT INTO place_profiles (poi_id, status, texts, best_times, meal_role, visit_min, facts,
                                     photos, sources, generated_at)
         VALUES ($1, 'ready', $2, '{morning,afternoon}', 'none', 75, $3, $4, $5, now())`,
        [
          id,
          JSON.stringify(TEXT),
          JSON.stringify([
            {
              kind: 'entry',
              source_url: 'https://agotourist.com/x',
              quote: 'Người lớn: 60.000 đ/vé',
              second_source: 'agrees',
            },
          ]),
          JSON.stringify([
            { key: `c/place-profiles/${id}/1.jpg`, source_page: 'https://example.vn/a' },
          ]),
          JSON.stringify([{ url: 'https://agotourist.com/x', title: 'Dinh III' }]),
        ],
      ),
    );
    const en = await read(english, id);
    expect(en).toMatchObject({
      status: 'ready',
      locale: 'en',
      whyGo: TEXT.en.why_go,
      bestTimes: ['morning', 'afternoon'],
      visitMin: 75,
      facts: [
        { kind: 'entry', text: 'Adult ticket 60.000 VND', sourceUrl: 'https://agotourist.com/x' },
      ],
      photos: [
        {
          url: `https://media.example.test/c/place-profiles/${id}/1.jpg`,
          sourcePage: 'https://example.vn/a',
        },
      ],
    });
    expect(await jobs('places.profile_translate', id)).toEqual([]);

    expect(await read(french, id)).toMatchObject({ status: 'ready', locale: 'en' });
    expect(await jobs('places.profile_translate', id)).toEqual([{ poi_id: id, locale: 'fr' }]);
    expect(await jobs('places.profile', id)).toEqual([]);
  });

  it('never profiles a place with a reviewed note', async () => {
    const id = await place('Crazy House', { why_go: 'A reviewed line.' });
    expect(await read(english, id)).toBeNull();
    expect(await jobs('places.profile', id)).toEqual([]);
  });

  it('answers null for a declined profile and queues nothing more', async () => {
    const id = await place('Unknown Corner');
    await withSystem(pool, (tx) =>
      tx.query("INSERT INTO place_profiles (poi_id, status) VALUES ($1, 'declined')", [id]),
    );
    expect(await read(english, id)).toBeNull();
    expect(await jobs('places.profile', id)).toEqual([]);
  });
});
