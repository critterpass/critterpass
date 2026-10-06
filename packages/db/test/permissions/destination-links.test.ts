/**
 * `destination_links` (C0, RLS R): how one destination leads to another. Every signed-in caller
 * reads them (they are about places, never about who asked), only the system writes them, and no
 * stream or publication carries them: phones read links through the api. A written link keeps its sources.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let cityId: string;
let areaId: string;

const SOURCE = JSON.stringify([{ url: 'https://example.org/cusco', title: 'Cusco', quote: '4 h' }]);

const insertLink = (columns: Record<string, unknown>) =>
  withSystem(harness.db.pool, (tx) => {
    const row = {
      key: `link-${randomUUID().slice(0, 8)}`,
      from_destination_id: cityId,
      to_destination_id: areaId,
      kind: 'day_trip',
      minutes: 210,
      mode: 'train',
      day_length: 'full',
      sources: SOURCE,
      ...columns,
    };
    const names = Object.keys(row);
    return tx.query(
      `INSERT INTO destination_links (${names.join(', ')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  });

beforeAll(async () => {
  harness = await startStreamHarness();
  const ids = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, coverage)
       VALUES ('links-cusco', 'Cusco', 'guest'), ('links-machu-picchu', 'Machu Picchu', 'area')
       RETURNING id`,
    );
    return rows.map((row) => row.id);
  });
  cityId = ids[0]!;
  areaId = ids[1]!;
  await insertLink({ key: 'links-cusco>links-machu-picchu:day_trip', essential: true });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('destination_links', () => {
  it('is read by every signed-in caller', async () => {
    const probe =
      "SELECT 1 FROM destination_links WHERE key = 'links-cusco>links-machu-picchu:day_trip'";
    for (const kind of ['outsider', 'exMember', 'member', 'organiser', 'anonymous'] as const) {
      expect(await visibleRows(harness, harness.fixture.actors[kind], probe), kind).toBe(1);
    }
  });

  it('is never written by a client', async () => {
    const asOrganiser = (sql: string, params: unknown[] = []) =>
      withUser(harness.db.pool, harness.fixture.actors.organiser, randomUUID(), (tx) =>
        tx.query(sql, params),
      );
    await expect(
      asOrganiser(
        `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                        mode, day_length, origin)
         VALUES ('mine', $1, $2, 'day_trip', 60, 'car', 'half', 'editorial')`,
        [cityId, areaId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(asOrganiser('UPDATE destination_links SET minutes = 11')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asOrganiser('DELETE FROM destination_links')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('is neither published nor streamed', async () => {
    const { rows } = await harness.db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'destination_links'",
    );
    expect(rows).toHaveLength(0);
    expect(JSON.stringify(harness.config)).not.toContain('destination_links');
  });

  it('keeps a day trip whole: a length, sources, both ends apart, a cost with its currency', async () => {
    const violation = /violates check constraint/;
    await expect(insertLink({ day_length: null })).rejects.toThrow(violation);
    await expect(insertLink({ to_destination_id: cityId })).rejects.toThrow(violation);
    await expect(insertLink({ kind: 'onward', day_length: null, essential: true })).rejects.toThrow(
      violation,
    );
    await expect(insertLink({ sources: '[]' })).rejects.toThrow(violation);
    await expect(insertLink({ cost_pp_minor: 5000 })).rejects.toThrow(violation);
    await expect(insertLink({ minutes: 5 })).rejects.toThrow(violation);
    await expect(insertLink({ mode: 'teleport' })).rejects.toThrow(violation);
    await expect(
      insertLink({ kind: 'onward', day_length: null, cost_pp_minor: 5000, cost_currency: 'PEN' }),
    ).resolves.toBeDefined();
    await expect(insertLink({ origin: 'editorial', sources: '[]' })).rejects.toThrow(
      /destination_links_ends_key/,
    );
  });
});
