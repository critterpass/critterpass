/**
 * `must_dos` (C1, RLS T): the crew reads every must-do of the trip; a member adds, edits and removes
 * only their own, never another member's; the fit columns belong to the fit-check job; a removed
 * must-do leaves the trip stream.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

const ADD = `INSERT INTO must_dos (trip_id, owner_id, title, freeform, priority)
  VALUES ($1, $2, $3, true, $4) RETURNING id`;

describe('must_dos', () => {
  it('is readable by the crew only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM must_dos WHERE trip_id = $1';
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBeGreaterThan(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it("never lets a member write another member's must-do", async () => {
    const { actors, tripId } = harness.fixture;
    await expect(as(actors.member, ADD, [tripId, actors.organiser, 'Nara', 1])).rejects.toThrow(
      /row-level security/i,
    );
    const edited = await as(
      actors.member,
      "UPDATE must_dos SET title = 'Nope' WHERE owner_id = $1",
      [actors.organiser],
    );
    expect(edited.rowCount).toBe(0);
    await expect(as(actors.outsider, ADD, [tripId, actors.outsider, 'Nara', 0])).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('lets a member add and remove their own, but not set its fit', async () => {
    const { actors, tripId } = harness.fixture;
    const { rows } = await as(actors.member, ADD, [tripId, actors.member, 'Kinkaku-ji', 0]);
    const id = (rows[0] as { id: string }).id;
    await expect(
      as(actors.member, "UPDATE must_dos SET fit_status = 'fits' WHERE id = $1", [id]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, ADD, [tripId, actors.member, 'Second primary', 0]),
    ).rejects.toThrow(/duplicate key/i);
    let synced = await harness.rows('trip', 'coOrganiser', { trip_id: tripId });
    expect(synced.get('must_dos')?.map((row) => row.id)).toContain(id);
    await as(actors.member, 'UPDATE must_dos SET deleted_at = now() WHERE id = $1', [id]);
    synced = await harness.rows('trip', 'coOrganiser', { trip_id: tripId });
    expect(synced.get('must_dos')?.map((row) => row.id)).not.toContain(id);
    const outsider = await harness.rows('trip', 'outsider', { trip_id: tripId });
    expect(outsider.get('must_dos') ?? []).toHaveLength(0);
  });
});
