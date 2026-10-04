/**
 * A trip's days before any draft, on the real stack. With the rollout switch off, locking dates
 * writes no plan (installed apps see exactly what they saw); with it on, the trip gets an
 * organiser-only draft with a day per date. `ensure_plan_days` gives one trip its days whatever the
 * switch says, once. A dates change keeps every stop: same day number and local time, a place on a
 * day that is gone goes back to Ideas, a custom stop moves to the last day.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import { registerProposalCommands } from '../../../src/commands/proposal';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const tokyo = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`).toISOString();

async function setSwitch(on: boolean): Promise<void> {
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('planning.redesign', $1::jsonb, true)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );
}

const lock = (crew: SetupCrew, from: number, to: number) =>
  harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(from),
    end: day(to),
  });

async function draftOf(tripId: string) {
  const { rows } = await harness.pool.query<{
    id: string | null;
    visibility: string | null;
    status: string | null;
    origin: string | null;
    dates: string[] | null;
    versions: number;
  }>(
    `SELECT v.id, v.visibility, v.status, v.origin,
            (SELECT array_agg(d.date::text ORDER BY d.day_no) FROM plan_days d WHERE d.version_id = v.id) AS dates,
            (SELECT count(*)::int FROM itinerary_versions a WHERE a.trip_id = t.id) AS versions
       FROM trips t LEFT JOIN itinerary_versions v ON v.id = t.draft_version_id WHERE t.id = $1`,
    [tripId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerDraftCommands(registry);
    registerProposalCommands(registry);
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('the trip has its days before any draft', () => {
  it('writes no plan when dates lock with the switch off, and one on request, once', async () => {
    await setSwitch(false);
    const crew = await buildSetupCrew(harness, 2);
    const [, member] = crew.members as [SignedIn, SignedIn];
    const locked = await lock(crew, 40, 42);
    expect(locked.status, JSON.stringify(locked.body)).toBe(200);
    expect(resultOf<Record<string, unknown>>(locked)).not.toHaveProperty('moved_stops');
    expect(await draftOf(crew.tripId)).toMatchObject({ id: null, versions: 0 });

    const denied = await harness.run(member, 'ensure_plan_days', { trip_id: crew.tripId });
    expect(errorOf(denied).code).toBe('FORBIDDEN');

    const first = await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(resultOf<{ created: boolean }>(first).created).toBe(true);
    const draft = await draftOf(crew.tripId);
    expect(draft).toMatchObject({
      visibility: 'organiser',
      status: 'draft',
      origin: 'dates',
      dates: [day(40), day(41), day(42)],
      versions: 1,
    });

    const again = await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
    expect(resultOf<{ created: boolean; version_id: string }>(again)).toMatchObject({
      created: false,
      version_id: draft.id,
    });
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM trips WHERE id = $1',
      [crew.tripId],
    );
    expect(rows[0]?.status).toBe('setup');

    // The empty plan is not a draft the guide made: nothing that needs one answers differently.
    expect(
      errorOf(
        await harness.run(crew.organiser, 'create_proposal', { trip_id: crew.tripId, config: {} }),
      ),
    ).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'setup' } });
    expect(
      errorOf(
        await harness.run(crew.organiser, 'request_redraft', {
          trip_id: crew.tripId,
          day: 1,
          reasons: ['slower'],
          base_version: draft.id,
        }),
      ),
    ).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'setup' } });
    expect(
      errorOf(
        await harness.run(crew.organiser, 'restore_draft_version', {
          trip_id: crew.tripId,
          version_id: draft.id,
        }),
      ),
    ).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'setup' } });
  });

  it('leaves a trip with open dates without a plan', async () => {
    const crew = await buildSetupCrew(harness, 1);
    const asked = await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
    expect(resultOf<{ created: boolean; version_id: string | null }>(asked)).toEqual({
      trip_id: crew.tripId,
      created: false,
      version_id: null,
    });
  });

  it('writes the empty plan when dates lock with the switch on, and follows a dates change', async () => {
    await setSwitch(true);
    const crew = await buildSetupCrew(harness, 1);
    expect((await lock(crew, 40, 42)).status).toBe(200);
    const empty = await draftOf(crew.tripId);
    expect(empty).toMatchObject({
      origin: 'dates',
      dates: [day(40), day(41), day(42)],
      versions: 1,
    });

    // The same dates again change nothing; new dates with no stops give a fresh empty plan.
    expect((await lock(crew, 40, 42)).status).toBe(200);
    expect((await draftOf(crew.tripId)).id).toBe(empty.id);
    expect((await lock(crew, 50, 53)).status).toBe(200);
    const moved = await draftOf(crew.tripId);
    expect(moved.dates).toEqual([day(50), day(51), day(52), day(53)]);
    expect(moved).toMatchObject({ origin: 'dates', versions: 1 });
    await setSwitch(false);
  });

  it('keeps every stop when the trip gets shorter and tells her which moved', async () => {
    const crew = await buildSetupCrew(harness, 1);
    expect((await lock(crew, 40, 42)).status).toBe(200);
    await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
    const draft = await draftOf(crew.tripId);
    const stops = { early: randomUUID(), place: randomUUID(), pin: randomUUID() };
    await withSystem(harness.pool, async (tx) => {
      const { rows: poi } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
         SELECT destination_id, 'Kinkaku-ji', 'temple_shrine', 35.0394, 135.7292, 'editorial'
           FROM trips WHERE id = $1 RETURNING id`,
        [crew.tripId],
      );
      const add = (
        stable: string,
        dayNo: number,
        hour: number,
        poiId: string | null,
        pin: unknown,
      ) =>
        tx.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
             poi_id, custom_place, category, created_by_kind)
           SELECT $1, d.id, $2, $3, $5, $6, 'Asia/Tokyo', $7, $8, 'activity', 'user'
             FROM plan_days d WHERE d.version_id = $1 AND d.day_no = $4`,
          [
            draft.id,
            crew.tripId,
            stable,
            dayNo,
            tokyo(day(39 + dayNo), hour),
            tokyo(day(39 + dayNo), hour + 1),
            poiId,
            pin === null ? null : JSON.stringify(pin),
          ],
        );
      await add(stops.early, 1, 9, null, { name: 'Aunt Mai', lat: 35.01, lng: 135.76 });
      await add(stops.place, 3, 10, poi[0]!.id, null);
      await add(stops.pin, 3, 15, null, { name: 'Tea with Aki', lat: 35.0, lng: 135.75 });
      await tx.query("UPDATE itinerary_versions SET origin = 'hand' WHERE id = $1", [draft.id]);
    });

    const shorter = await lock(crew, 60, 61);
    expect(shorter.status, JSON.stringify(shorter.body)).toBe(200);
    expect(resultOf<{ moved_stops: unknown[] }>(shorter).moved_stops).toEqual([
      { stable_id: stops.place, to: 'ideas' },
      { stable_id: stops.pin, to: 'day', day_no: 2 },
    ]);
    const after = await draftOf(crew.tripId);
    expect(after.dates).toEqual([day(60), day(61)]);
    expect(after.versions).toBe(1);
    const { rows: items } = await harness.pool.query<{
      stable_id: string;
      day_no: number;
      at: string;
    }>(
      `SELECT i.stable_id, d.day_no, i.starts_at AS at FROM plan_items i
         JOIN plan_days d ON d.id = i.day_id WHERE i.version_id = $1 ORDER BY d.day_no`,
      [after.id],
    );
    expect(
      items.map((item) => [item.stable_id, item.day_no, new Date(item.at).toISOString()]),
    ).toEqual([
      [stops.early, 1, tokyo(day(60), 9)],
      [stops.pin, 2, tokyo(day(61), 15)],
    ]);
    const { rows: ideas } = await harness.pool.query<{ name: string; backer_ids: string[] }>(
      'SELECT name, backer_ids FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL',
      [crew.tripId],
    );
    expect(ideas).toEqual([{ name: 'Kinkaku-ji', backer_ids: [crew.organiser.uid] }]);
  });
});
