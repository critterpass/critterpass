/**
 * `plan_legs` (C1, RLS T + version visibility): legs of the crew's plan reach the crew on the trip
 * stream; legs of an organiser-only draft reach organisers only, through trip_draft; nobody writes
 * them through app_user (the legs job does). A leg runs between the stay and a stop or two stops,
 * never from a place to itself.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { insertItineraryVersion, insertPlanDay } from '../helpers/plan-actors';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let draftLegId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId } = harness.fixture;
  draftLegId = await withSystem(harness.db.pool, async (tx) => {
    const versionId = await insertItineraryVersion(tx, {
      tripId,
      visibility: 'organiser',
      status: 'draft',
    });
    const dayId = await insertPlanDay(tx, { versionId, tripId, dayNo: 1 });
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters, source)
       VALUES ($1, $2, $3, $4, 'stay', 'walk', 12, 900, 'valhalla') RETURNING id`,
      [tripId, versionId, dayId, randomUUID()],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('plan_legs', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'plan_legs');
  });

  it("keeps an organiser-only draft's legs to organisers, on trip_draft only", async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM plan_legs WHERE id = $1';
    for (const kind of ['organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [draftLegId]), kind).toBe(1);
      const draft = await harness.rows('trip_draft', kind, { trip_id: tripId });
      expect(
        draft.get('plan_legs')?.map((row) => row['id']),
        kind,
      ).toEqual([draftLegId]);
    }
    for (const kind of ['member', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [draftLegId]), kind).toBe(0);
      const draft = await harness.rows('trip_draft', kind, { trip_id: tripId });
      expect(draft.get('plan_legs') ?? [], kind).toEqual([]);
    }
    for (const kind of ['member', 'organiser'] as const) {
      const trip = await harness.rows('trip', kind, { trip_id: tripId });
      expect(
        trip.get('plan_legs')?.map((row) => row['id']),
        kind,
      ).not.toContain(draftLegId);
    }
  });

  it('rejects a leg end that is neither the stay nor a stop, and a leg to itself', async () => {
    const { tripId, versionId, dayId } = harness.fixture;
    const stop = randomUUID();
    for (const [from, to] of [
      ['hotel', stop],
      [stop, stop],
    ]) {
      await expect(
        withSystem(harness.db.pool, (tx) =>
          tx.query(
            `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters, source)
             VALUES ($1, $2, $3, $4, $5, 'drive', 5, 1000, 'straight_line')`,
            [tripId, versionId, dayId, from, to],
          ),
        ),
      ).rejects.toThrow(/plan_legs_keys_check/);
    }
  });
});
