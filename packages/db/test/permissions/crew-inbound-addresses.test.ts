/**
 * `crew_inbound_addresses` (C2, RLS M): every crew gets its forward address when it is created,
 * read and synced by its active members only. Rotation (the system role's) retires the old address
 * so nobody reads or streams it any more; app_user writes nothing and cannot issue addresses.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT local_part FROM crew_inbound_addresses WHERE crew_id = $1';

describe('crew inbound addresses', () => {
  it('gives a new crew an address made from its name', async () => {
    const pool = harness.db.pool;
    const crew = await pool.query<{ id: string }>(
      "INSERT INTO crews (name) VALUES ('Bali Six!') RETURNING id",
    );
    const { rows } = await pool.query<{ local_part: string }>(
      "SELECT local_part FROM crew_inbound_addresses WHERE crew_id = $1 AND status = 'active'",
      [crew.rows[0]!.id],
    );
    expect(rows[0]?.local_part).toMatch(/^bali-six(-[0-9a-f]{5})?$/);
  });

  it('is read by active members only', async () => {
    const { actors, crewId } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBe(0);
    }
    const synced = await harness.rows('crews', 'member');
    expect(synced.get('crew_inbound_addresses')).toHaveLength(1);
    expect(
      (await harness.rows('crews', 'outsider')).get('crew_inbound_addresses') ?? [],
    ).toHaveLength(0);
  });

  it('retires the old address on rotation, for reads and sync alike', async () => {
    const { actors, crewId } = harness.fixture;
    const before = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query<{ local_part: string }>(probe, [crewId]),
    );
    const next = await withSystem(harness.db.pool, (tx) =>
      tx.query<{ part: string }>('SELECT app.issue_inbound_address($1, true) AS part', [crewId]),
    );
    const after = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query<{ local_part: string }>(probe, [crewId]),
    );
    expect(after.rows.map((row) => row.local_part)).toEqual([next.rows[0]!.part]);
    expect(next.rows[0]!.part).not.toBe(before.rows[0]!.local_part);
    const synced = (await harness.rows('crews', 'member')).get('crew_inbound_addresses') ?? [];
    expect(synced.map((row) => row['local_part'])).toEqual([next.rows[0]!.part]);
  });

  it('refuses app_user writes and address issuing', async () => {
    const { actors, crewId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE crew_inbound_addresses SET local_part = 'mine' WHERE crew_id = $1", [
          crewId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT app.issue_inbound_address($1, true)', [crewId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
