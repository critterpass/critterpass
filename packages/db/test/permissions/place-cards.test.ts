/**
 * `place_cards` (C0, RLS R): one card per recommended place, kept in line with `pois` by a trigger.
 * Any signed-in client reads the cards and none writes them; the `explore` and `trip_pack` streams
 * send them as `pois`, and `pois` itself is out of the publication so replication never copies the
 * open-data catalogue. A place gets its card while it is editorial or picked, not hidden and not
 * merged, and loses it as soon as it stops being one.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let destinationId: string;

const CARD_COLUMNS = [
  'id',
  'destination_id',
  'name',
  'name_local',
  'category',
  'lat',
  'lng',
  'address',
  'hours',
  'hours_verified_at',
  'price_level',
  'editorial',
  'tags',
  'status',
  'curation',
  'pick_rank',
  'visit_radius_m',
  'timezone',
  'last_live_check_at',
  'created_at',
  'updated_at',
].join(', ');

const system = <T>(sql: string, params: readonly unknown[] = []) =>
  withSystem(harness.db.pool, async (tx) => (await tx.query<T & object>(sql, [...params])).rows);

const insertPlace = async (
  name: string,
  values: { curation?: string; pickRank?: number; status?: string } = {},
): Promise<string> => {
  const rows = await system<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, status, curation, pick_rank)
     VALUES ($1, $2, 'other', 16.05, 108.2, $3, $4, $5) RETURNING id`,
    [
      destinationId,
      name,
      values.status ?? 'active',
      values.curation ?? 'auto',
      values.pickRank ?? null,
    ],
  );
  return rows[0]!.id;
};

const card = async (id: string): Promise<Record<string, unknown> | undefined> =>
  (await system<Record<string, unknown>>('SELECT * FROM place_cards WHERE id = $1', [id]))[0];

const placeAsCard = async (id: string): Promise<Record<string, unknown> | undefined> =>
  (
    await system<Record<string, unknown>>(`SELECT ${CARD_COLUMNS} FROM pois WHERE id = $1`, [id])
  )[0];

beforeAll(async () => {
  harness = await startStreamHarness();
  const rows = await system<{ id: string }>(
    "SELECT id FROM destinations WHERE slug = 'matrix-probe-destination'",
  );
  destinationId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('place_cards trigger', () => {
  it('writes a card with exactly the place columns for an editorial or picked place, and none for an open-data one', async () => {
    const editorial = await insertPlace('Editorial place', { curation: 'editorial' });
    const picked = await insertPlace('Picked place', { pickRank: 1 });
    const imported = await insertPlace('Imported place');
    expect(await card(editorial)).toEqual(await placeAsCard(editorial));
    expect(await card(picked)).toEqual(await placeAsCard(picked));
    expect(await card(imported)).toBeUndefined();
  });

  it('follows a change to the place and ignores a change to columns the card does not carry', async () => {
    const id = await insertPlace('Before rename', { curation: 'editorial' });
    await system("UPDATE pois SET name = 'After rename', pick_rank = 3 WHERE id = $1", [id]);
    expect(await card(id)).toEqual(await placeAsCard(id));
    expect((await card(id))?.['name']).toBe('After rename');

    const before = await system<{ xmin: string }>('SELECT xmin FROM place_cards WHERE id = $1', [
      id,
    ]);
    await system(`UPDATE pois SET source_ids = '{"osm": "n1"}', confidence = 0.9 WHERE id = $1`, [
      id,
    ]);
    const after = await system<{ xmin: string }>('SELECT xmin FROM place_cards WHERE id = $1', [
      id,
    ]);
    expect(after[0]?.xmin).toBe(before[0]?.xmin);
  });

  it.each([
    ['hidden', "UPDATE pois SET status = 'hidden' WHERE id = $1"],
    ['unpicked', 'UPDATE pois SET pick_rank = NULL WHERE id = $1'],
    ['merged', 'UPDATE pois SET merged_into_id = $2 WHERE id = $1'],
    ['deleted', 'DELETE FROM pois WHERE id = $1'],
  ])('drops the card of a place %s', async (how, sql) => {
    const id = await insertPlace(`Picked then ${how}`, { pickRank: 2 });
    const keeper = await insertPlace(`Kept for ${how}`, { curation: 'editorial' });
    expect(await card(id)).toBeDefined();
    await system(sql, sql.includes('$2') ? [id, keeper] : [id]);
    expect(await card(id)).toBeUndefined();
    expect(await card(keeper)).toBeDefined();
  });

  it('brings a card back when a place becomes recommended again', async () => {
    const id = await insertPlace('Hidden editorial', { curation: 'editorial', status: 'hidden' });
    expect(await card(id)).toBeUndefined();
    await system("UPDATE pois SET status = 'active' WHERE id = $1", [id]);
    expect(await card(id)).toEqual(await placeAsCard(id));
  });
});

describe('place_cards permissions and sync', () => {
  it('is read by every signed-in client and written by none', async () => {
    const id = await insertPlace('Readable card', { curation: 'editorial' });
    const { actors } = harness.fixture;
    for (const [kind, uid] of Object.entries(actors)) {
      expect(
        await visibleRows(harness, uid, 'SELECT 1 FROM place_cards WHERE id = $1', [id]),
        kind,
      ).toBe(1);
    }
    for (const sql of [
      "UPDATE place_cards SET name = 'Forged' WHERE id = $1",
      'DELETE FROM place_cards WHERE id = $1',
      'INSERT INTO place_cards SELECT * FROM place_cards WHERE id = $1',
    ]) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) => tx.query(sql, [id])),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('is published in place of pois', async () => {
    const { rows } = await harness.db.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename IN ('pois', 'place_cards')",
    );
    expect(rows.map((row) => row.tablename)).toEqual(['place_cards']);
  });

  it("sends a new recommended place on the destination's explore stream", async () => {
    const id = await insertPlace('Fresh pick on explore', { pickRank: 7 });
    const rows = await harness.rows('explore', 'outsider', { destination_id: destinationId });
    expect(idsByTable(rows)['place_cards']).toContain(id);
  });
});
