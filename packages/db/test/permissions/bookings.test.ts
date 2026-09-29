/**
 * `bookings` (C1, barcode C2): a crew booking is read by the trip's crew and synced with the trip;
 * a personal booking is its owner's alone, in the table, the stream and the guide's view. Nobody
 * selects the barcode envelope through app_user (the owner gets it decrypted from the api), nobody
 * writes through app_user, and a deleted booking disappears for its owner too.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { FIXTURE_HIDDEN_FLIGHT, FIXTURE_STAY_TITLE } from '../helpers/bookings-fixture';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const byTitle = 'SELECT 1 FROM bookings WHERE trip_id = $1 AND title = $2';
const hiddenTitle = `SQ ${FIXTURE_HIDDEN_FLIGHT}`;

describe('bookings', () => {
  it('shows a crew booking to the trip crew and nobody else', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byTitle, [tripId, FIXTURE_STAY_TITLE]),
        kind,
      ).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byTitle, [tripId, FIXTURE_STAY_TITLE]),
        kind,
      ).toBe(0);
    }
  });

  it('keeps a personal booking invisible to crewmates', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, byTitle, [tripId, hiddenTitle])).toBe(1);
    for (const kind of ['coOrganiser', 'member', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], byTitle, [tripId, hiddenTitle]), kind).toBe(
        0,
      );
    }
  });

  it('never lets app_user select the barcode envelope, not even its owner', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT barcode_payload_enc FROM bookings WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
      tx.query<{ barcode_format: string }>(
        'SELECT barcode_format FROM bookings WHERE trip_id = $1 AND title = $2',
        [tripId, hiddenTitle],
      ),
    );
    expect(rows).toEqual([{ barcode_format: 'pdf417' }]);
  });

  it('refuses every direct write, owner or not', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE bookings SET title = 'mine' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO bookings (trip_id, owner_id, type, title, visibility)
           VALUES ($1, $2, 'stay', 'x', 'crew')`,
          [tripId, actors.member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('hides a deleted booking from its owner as well', async () => {
    const { actors, tripId } = harness.fixture;
    const setDeleted = (value: string | null) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query('UPDATE bookings SET deleted_at = $3 WHERE trip_id = $1 AND title = $2', [
          tripId,
          hiddenTitle,
          value,
        ]),
      );
    await setDeleted(new Date().toISOString());
    expect(await visibleRows(harness, actors.organiser, byTitle, [tripId, hiddenTitle])).toBe(0);
    await setDeleted(null);
  });

  it('syncs crew bookings to members and personal ones to their owner, never the barcode', async () => {
    const { tripId } = harness.fixture;
    const titles = async (kind: 'member' | 'organiser' | 'outsider' | 'exMember' | 'anonymous') => {
      const rows = (await harness.rows('trip', kind, { trip_id: tripId })).get('bookings') ?? [];
      for (const row of rows) expect(row).not.toHaveProperty('barcode_payload_enc');
      return rows.map((row) => row['title']).sort();
    };
    expect(await titles('organiser')).toEqual([FIXTURE_STAY_TITLE, hiddenTitle].sort());
    expect(await titles('member')).toEqual([FIXTURE_STAY_TITLE, 'SQ 211'].sort());
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await titles(kind), kind).toEqual([]);
    }
  });

  it("gives the guide the trip's crew bookings only, without barcodes, prices or documents", async () => {
    const { actors, tripId } = harness.fixture;
    const rows = await withGuideReader(
      harness.db.pool,
      actors.organiser,
      tripId,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>('SELECT * FROM llm.bookings WHERE trip_id = $1', [
            tripId,
          ])
        ).rows,
    );
    expect(rows.map((row) => row['title'])).toEqual([FIXTURE_STAY_TITLE]);
    for (const hidden of ['barcode_payload_enc', 'price_minor', 'supplier_ref', 'details']) {
      expect(rows[0], hidden).not.toHaveProperty(hidden);
    }
    const outsider = await withGuideReader(
      harness.db.pool,
      actors.outsider,
      tripId,
      async (tx) =>
        (await tx.query('SELECT 1 FROM llm.bookings WHERE trip_id = $1', [tripId])).rowCount,
    );
    expect(outsider).toBe(0);
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM bookings'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
