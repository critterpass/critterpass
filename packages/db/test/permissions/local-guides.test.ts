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
let uid: string;
let destinationId: string;

const SUMMARY = {
  en: 'Praised for food stops and pacing.',
  vi: 'Được khen vì điểm ăn và nhịp đi.',
};

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  destinationId = await withSystem(db.pool, async (tx) => {
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, country) VALUES ('guide-town', 'Guide Town', 'TH') RETURNING id",
    );
    return firstRow(dest.rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const device = () => anonymousActor().device;

const insert = (url: string, extra: Record<string, unknown> = {}) => {
  const row = { name: 'Somchai T.', review_summary: SUMMARY, status: 'listed', ...extra };
  return withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      `INSERT INTO local_guides (destination_id, name, kind, profile_url, review_summary, status,
                                 rating, merged_into_id)
       VALUES ($1, $2, 'individual', $3, $4, $5, $6, $7) RETURNING id`,
      [
        destinationId,
        row.name,
        url,
        JSON.stringify(row.review_summary),
        row.status,
        row['rating'] === undefined ? null : JSON.stringify(row['rating']),
        row['merged_into_id'] ?? null,
      ],
    ),
  );
};

describe('local_guides RLS: listed guides readable by every signed-in reader, written by the loader (class R)', () => {
  it('shows a reader listed guides only', async () => {
    await insert('https://www.toursbylocals.com/somchai');
    await insert('https://hidden.example/guide', { status: 'hidden' });
    const { rows } = await withUser(db.pool, uid, device(), (tx) =>
      tx.query<{ profile_url: string }>('SELECT profile_url FROM local_guides'),
    );
    expect(rows).toEqual([{ profile_url: 'https://www.toursbylocals.com/somchai' }]);
  });

  it('refuses every app_user write', async () => {
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query(
          `INSERT INTO local_guides (destination_id, name, kind, profile_url, review_summary)
           VALUES ($1, 'Me', 'individual', 'https://me.example', '{"en": "Great"}')`,
          [destinationId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query("UPDATE local_guides SET status = 'hidden'"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) => tx.query('DELETE FROM local_guides')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses an email anywhere in what is shown, and a listed duplicate', async () => {
    await expect(
      insert('https://a.example/x', {
        review_summary: { en: 'Book at somchai.tours@gmail.com', vi: 'x' },
      }),
    ).rejects.toThrow(/local_guides_no_email/u);
    await expect(insert('https://www.toursbylocals.com/somchai')).rejects.toThrow(
      /local_guides_profile_key/u,
    );
    const target = firstRow((await insert('https://b.example/one')).rows).id;
    await expect(insert('https://b.example/two', { merged_into_id: target })).rejects.toThrow(
      /local_guides_merged_hidden/u,
    );
  });

  it('keeps nothing of a removed guide but the page that keeps them out', async () => {
    await expect(insert('https://c.example/gone', { status: 'removed' })).rejects.toThrow(
      /local_guides_removed_blank/u,
    );
    await expect(
      insert('https://c.example/gone', { status: 'removed', name: '', review_summary: {} }),
    ).resolves.toBeDefined();
  });

  it('links no user, crew or trip, and never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'local_guides' AND column_name ~ '(user|trip|crew|member|phone|email)'`,
    );
    expect(rows).toEqual([]);
    const published = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'local_guides'`,
    );
    expect(published.rows).toEqual([]);
  });
});
