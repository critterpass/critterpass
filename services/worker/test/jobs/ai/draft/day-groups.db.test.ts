/**
 * A draft planned in day groups, against the real database: a trip with a second stop plans each
 * city's days from that city's places, puts a must-do in the second city on its days and saves
 * each later day with its city; a first draft gives an essential day trip its day. With
 * `trip.areas` off nothing changes.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import type { Itinerary } from '@cp/domain';
import { dayWindow } from '@cp/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentStepContext } from '../../../../src/ai/job-runner';
import { firstDraftAsk, planDayGroups, savedAreas } from '../../../../src/jobs/ai/draft/day-groups';
import { eachGroup, groupProgress } from '../../../../src/jobs/ai/draft/group-progress';
import { load } from '../../../../src/jobs/ai/draft/job-context';
import { loadDraftTrip } from '../../../../src/jobs/ai/draft/load';
import {
  draftMetrics,
  persistDraft,
  type DraftToSave,
} from '../../../../src/jobs/ai/draft/persist';
import { scopeRedraft } from '../../../../src/jobs/ai/draft/redraft-group';
import { saveCandidate } from '../../../../src/jobs/ai/draft/redraft-store';
import { startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';
import { seedTrip } from './kyoto-trip';

let harness: JobsHarness;
let tripId: string;
let organiser: string;
let kyoto: string;
let nara: string;
const naraPlaces: string[] = [];

const NARA = [
  ['Tōdai-ji', 'temple_shrine', 34.6889, 135.8398],
  ['Nara Park', 'nature', 34.685, 135.843],
  ['Kasuga-taisha', 'temple_shrine', 34.6812, 135.8484],
  ['Naramachi', 'other', 34.6776, 135.8295],
] as const;

beforeAll(async () => {
  harness = await startJobsHarness();
  ({ tripId, organiser } = await seedTrip(harness.pool));
  const { rows } = await harness.pool.query<{ destination_id: string; crew_id: string }>(
    'SELECT destination_id, crew_id FROM trips WHERE id = $1',
    [tripId],
  );
  kyoto = rows[0]?.destination_id as string;
  const created = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, tz, currency)
     VALUES ('jp-nara', 'Nara', 'Japan', 'Asia/Tokyo', 'JPY') RETURNING id`,
  );
  nara = created.rows[0]?.id as string;
  for (const [name, category, lat, lng] of NARA) {
    const poi = await harness.pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, hours, editorial, curation, timezone)
       VALUES ($1, $2, $3, $4, $5, '{"weekly": {}}', '{"time_needed_min": 90}', 'editorial',
               'Asia/Tokyo') RETURNING id`,
      [nara, name, category, lat, lng],
    );
    naraPlaces.push(poi.rows[0]?.id as string);
  }
  await harness.pool.query(
    // Her one must-do is in Nara now.
    'UPDATE must_dos SET title = $3, poi_id = $4 WHERE trip_id = $1 AND owner_id = $2',
    [tripId, organiser, 'Tōdai-ji', naraPlaces[0]],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const setAreas = (on: boolean) =>
  harness.pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ('trip.areas', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );

async function plannedContext() {
  const trip = await loadDraftTrip(harness.pool, tripId, organiser);
  if (trip === null) throw new Error('trip not ready');
  const groups = await planDayGroups(harness.pool, firstDraftAsk(trip, []));
  const ctx = {
    pool: harness.pool,
    agentJob: { id: randomUUID(), tripId, userId: organiser },
    input: { trip_id: tripId },
    results: { read_profiles: { groups } },
    usage: {},
  } as unknown as AgentStepContext;
  return { trip, groups, ctx };
}

describe('a trip with a second stop', () => {
  beforeAll(async () => {
    const { rows } = await harness.pool.query<{ crew_id: string }>(
      'SELECT crew_id FROM trips WHERE id = $1',
      [tripId],
    );
    const crewId = rows[0]?.crew_id;
    await harness.pool.query(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       VALUES ($1, $2, 1, $3, 2), ($1, $2, 2, $4, 1)`,
      [tripId, crewId, kyoto, nara],
    );
  });

  it('is planned as one destination while trip.areas is off', async () => {
    await setAreas(false);
    const { groups } = await plannedContext();
    expect(groups).toEqual({ groups: [], dayTrips: null });
  });

  it("plans each city's days from its own places and saves the later days with their city", async () => {
    await setAreas(true);
    const { trip, groups, ctx } = await plannedContext();
    expect(groups.groups.map((g) => [g.destinationId, g.dayNos])).toEqual([
      [kyoto, [1, 2]],
      [nara, [3, 4]],
    ]);
    const loaded = await load(ctx);
    const [first, second] = loaded.groups ?? [];
    expect(first?.input.frame.dates).toHaveLength(2);
    expect(second?.input.frame.dates).toHaveLength(2);
    expect([...(second?.input.pois.keys() ?? [])].sort()).toEqual([...naraPlaces].sort());
    expect([...(first?.input.pois.keys() ?? [])].some((id) => naraPlaces.includes(id))).toBe(false);
    // The must-do in the second city is planned on its days only.
    expect(second?.input.frame.mustDos.map((m) => m.poiId)).toEqual([naraPlaces[0]]);
    expect(first?.input.frame.mustDos.some((m) => m.poiId === naraPlaces[0])).toBe(false);
    // The first city's last day is a full one; the second city's first day waits for the move.
    if (first === undefined || second === undefined) throw new Error('two groups');
    expect(dayWindow(first.input.frame, 1).endMin).toBe(22 * 60);
    expect(dayWindow(second.input.frame, 0).startMin).toBeGreaterThanOrEqual(13 * 60);

    const itinerary: Itinerary = {
      currency: trip.currency,
      days: loaded.input.frame.dates.map((date, index) => ({
        day_no: index + 1,
        date,
        theme: `Day ${index + 1}`,
        items: [],
      })),
    };
    const save: DraftToSave = {
      jobId: ctx.agentJob.id,
      trip,
      input: loaded.input,
      outcome: {
        itinerary,
        first: { ok: true, violations: [], costPpMinor: 0 },
        loops: 0,
        dropped: [],
      },
      stays: [],
      closures: [],
      slotAvailable: [],
      ...savedAreas(groups),
    };
    const once = await withSystem(harness.pool, (tx) => persistDraft(tx, save));
    // A retried step finds the version it already wrote.
    const again = await withSystem(harness.pool, (tx) => persistDraft(tx, save));
    const saved = { once, again };
    expect(saved.again?.versionId).toBe(saved.once?.versionId);
    expect(saved.again?.created).toBe(false);
    const { rows } = await harness.pool.query<{ day_no: number; destination_id: string | null }>(
      'SELECT day_no, destination_id FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [saved.once?.versionId],
    );
    expect(rows).toEqual([
      { day_no: 1, destination_id: null },
      { day_no: 2, destination_id: null },
      { day_no: 3, destination_id: nara },
      { day_no: 4, destination_id: nara },
    ]);
    // A redraft's candidate keeps every day's area.
    const candidate = await withSystem(harness.pool, (tx) =>
      saveCandidate(tx, {
        jobId: randomUUID(),
        tripId,
        baseVersionId: saved.once?.versionId as string,
        itinerary,
        metrics: draftMetrics(save),
        coverage: null,
      }),
    );
    const kept = await harness.pool.query<{ day_no: number; destination_id: string | null }>(
      'SELECT day_no, destination_id FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [candidate],
    );
    expect(kept.rows).toEqual(rows);
  });
});

describe('a first draft of a trip with an essential day trip', () => {
  beforeAll(async () => {
    await harness.pool.query('DELETE FROM trip_stops WHERE trip_id = $1', [tripId]);
    // The draft saved above gave days 3 and 4 to Nara: this first draft starts from none.
    await harness.pool.query('UPDATE trips SET draft_version_id = NULL WHERE id = $1', [tripId]);
    await harness.pool.query(
      `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
         mode, day_length, essential, origin)
       VALUES ('kyoto-nara', $1, $2, 'day_trip', 45, 'train', 'full', true, 'editorial')`,
      [kyoto, nara],
    );
    await setAreas(true);
  });

  it('gives it the middle day nearest the midpoint, reached after the train', async () => {
    const { groups, ctx } = await plannedContext();
    expect(groups.dayTrips).toEqual({
      placed: [{ destinationId: nara, name: 'Nara', minutes: 45, dayNo: 3 }],
      leftOut: [],
    });
    expect(groups.groups.map((g) => [g.destinationId, g.dayNos])).toEqual([
      [kyoto, [1, 2, 4]],
      [nara, [3]],
    ]);
    const loaded = await load(ctx);
    const day = loaded.groups?.[1];
    expect(day?.dayTrip).toEqual({ name: 'Nara' });
    if (day === undefined) throw new Error('a day-trip group');
    const window = dayWindow(day.input.frame, 0);
    expect(window.earliestMin).toBe(7 * 60 + 45);
    expect(window.endMin).toBe(21 * 60 - 45);
    expect(savedAreas(groups).dayAreas).toEqual(new Map([[3, nara]]));
  });

  it('redoes one day from the places of the area that day is spent in', async () => {
    // The draft she is looking at: day three is the day in Nara, the others are in Kyoto.
    const { rows } = await harness.pool.query<{ version_id: string }>(
      `UPDATE plan_days SET destination_id = CASE WHEN day_no = 3 THEN $2::uuid END
        WHERE version_id = (SELECT id FROM itinerary_versions WHERE trip_id = $1
                             ORDER BY created_at LIMIT 1)
        RETURNING version_id`,
      [tripId, nara],
    );
    const baseVersion = rows[0]?.version_id as string;
    const loaded = await load({
      pool: harness.pool,
      agentJob: { id: randomUUID(), tripId, userId: organiser },
      input: { trip_id: tripId, base_version: baseVersion },
      results: {},
      usage: {},
    } as unknown as AgentStepContext);
    const base: Itinerary = {
      currency: loaded.trip.currency,
      days: loaded.input.frame.dates.map((date, index) => ({
        day_no: index + 1,
        date,
        theme: `Day ${index + 1}`,
        items: [],
      })),
    };
    const offered = (dayNo: number) => {
      const scoped = scopeRedraft(loaded.groups, dayNo, base);
      if (scoped === null) throw new Error('a day of a grouped trip');
      return { scoped, places: [...scoped.group.input.pois.keys()] };
    };
    // The day trip's day is offered Nara's places and no place of the city.
    const away = offered(3);
    expect(away.scoped.group.destinationId).toBe(nara);
    expect(away.scoped.dayNo).toBe(1);
    expect([...away.places].sort()).toEqual([...naraPlaces].sort());
    // A city day is never offered a place of the day-trip area.
    const city = offered(2);
    expect(city.scoped.group.destinationId).toBe(kyoto);
    expect(city.places.length).toBeGreaterThan(0);
    expect(city.places.some((id) => naraPlaces.includes(id))).toBe(false);
    expect(city.scoped.base.days.map((day) => day.date)).toEqual(
      [1, 2, 4].map((dayNo) => base.days[dayNo - 1]?.date),
    );
  });
});

describe('a step of a grouped draft that stopped mid-way', () => {
  it('finds the groups it finished on the job row and asks only for the other', async () => {
    // A draft job as it stands while one of its steps runs.
    const { rows } = await harness.pool.query<{ id: string }>(
      `INSERT INTO agent_jobs (trip_id, user_id, kind, status, steps, input_hash)
       VALUES ($1, $2, 'draft', 'running', '[]', $3) RETURNING id`,
      [tripId, organiser, randomUUID()],
    );
    const job = { id: rows[0]?.id as string };
    const progress = groupProgress(harness.pool, job.id, 'days');
    const asked: number[] = [];
    const run = (failing: boolean) => (index: number) => {
      asked.push(index);
      return index === 0 && failing
        ? Promise.reject(new Error('the guide did not answer'))
        : Promise.resolve({ itinerary: { days: [index] } });
    };
    await expect(eachGroup(2, progress, run(true))).rejects.toThrow('the guide did not answer');
    // Another step's kept groups are its own.
    const outline = groupProgress(harness.pool, job.id, 'skeleton');
    expect((await outline.read()).size).toBe(0);
    asked.length = 0;
    expect(await eachGroup(2, progress, run(false))).toEqual([
      { itinerary: { days: [0] } },
      { itinerary: { days: [1] } },
    ]);
    expect(asked).toEqual([0]);
    // A job that is over keeps nothing more.
    await harness.pool.query("UPDATE agent_jobs SET status = 'cancelled' WHERE id = $1", [job.id]);
    await outline.keep(0, { late: true });
    expect((await outline.read()).size).toBe(0);
  });
});
