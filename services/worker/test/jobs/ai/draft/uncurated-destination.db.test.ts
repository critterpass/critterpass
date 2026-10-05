/**
 * Drafting where our editors have curated nothing: the draft's places are the destination's
 * machine picks (made first when a draft starts before they exist), planned with the usual hours
 * and visit length of their kind, with the well-known ones ahead of the open-data fill. A curated
 * destination still drafts from its editorial set alone. And a day the draft left empty is still
 * a day of the version: the organiser can redraft it.
 */
import { randomUUID } from 'node:crypto';

import { buildRedraftRequest, createGateway } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { withSystem } from '@cp/db';
import type { Itinerary } from '@cp/domain';
import { dayWindow, scheduleDay } from '@cp/planner';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentStepContext } from '../../../../src/ai/job-runner';
import { load } from '../../../../src/jobs/ai/draft/job-context';
import { loadDraftPlaces } from '../../../../src/jobs/ai/draft/load-places';
import { persistDraft } from '../../../../src/jobs/ai/draft/persist';
import { ensurePlacePicks, tooFewCandidates } from '../../../../src/jobs/ai/draft/place-picks';
import { loadBaseDraft } from '../../../../src/jobs/ai/draft/redraft-store';
import { deckCandidates } from '../../../../src/jobs/ai/swipe-deck';
import { silent, startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';
import { FILL, NAMED_IN_ORDER, seedDaLat, type DaLat } from '../../../places/pick/da-lat-places';
import { seedTrip } from './kyoto-trip';

let harness: JobsHarness;
let daLat: DaLat;
let tripId: string;
let organiser: string;
let kyoto: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  ({ tripId, organiser } = await seedTrip(harness.pool));
  const { rows } = await harness.pool.query<{ destination_id: string }>(
    'SELECT destination_id FROM trips WHERE id = $1',
    [tripId],
  );
  kyoto = rows[0]?.destination_id as string;
  daLat = await seedDaLat(harness.pool, 'draft');
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

function stepContext(input: unknown): AgentStepContext {
  return {
    pool: harness.pool,
    agentJob: { id: randomUUID(), tripId, userId: organiser },
    input,
    results: {},
    usage: {},
  } as unknown as AgentStepContext;
}

/** A named answer never asks the job to pick again. */
const noQueue = {
  send: () => Promise.reject(new Error('no pick should be queued')),
} as unknown as Pick<PgBoss, 'send'>;

const recorded = () =>
  createGateway({ apiKey: 'fixture-key', fetch: fixtureTransport(['place-picks-da-lat']).fetch });

describe('a draft in a curated destination', () => {
  it('reads the editorial set and no unpicked open-data place', async () => {
    const { rows } = await harness.pool.query<{ id: string }>(
      `SELECT id FROM pois WHERE destination_id = $1 AND curation = 'editorial' AND status = 'active'
          AND category NOT IN ('transit', 'stay', 'health')`,
      [kyoto],
    );
    await harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, confidence)
       VALUES ($1, 'Open-data ramen bar', 'food', 35.0, 135.76, $2, 0.9)`,
      [kyoto, JSON.stringify({ fsq_os: 'f', overture: 'o' })],
    );
    const places = await loadDraftPlaces(harness.pool, kyoto, []);
    expect(places.map((poi) => poi.id).sort()).toEqual(rows.map((row) => row.id).sort());
    expect(places.every((poi) => poi.editorial)).toBe(true);
  });
});

describe('a draft in a destination without a curated set', () => {
  it('has nothing but must-dos before the picks exist, and says the plan is thin', async () => {
    await harness.pool.query('DELETE FROM must_dos WHERE trip_id = $1', [tripId]);
    // Open-data rows carry no diet tags, so a crew with a diet is offered no meal place from
    // them; this crew has none.
    await harness.pool.query('DELETE FROM participant_dietary_flags WHERE trip_id = $1', [tripId]);
    await harness.pool.query('UPDATE trips SET destination_id = $2 WHERE id = $1', [
      tripId,
      daLat.destinationId,
    ]);
    expect(await loadDraftPlaces(harness.pool, daLat.destinationId, [])).toEqual([]);
    const { input } = await load(stepContext({ trip_id: tripId }));
    expect(input.pools.activities).toEqual([]);
    expect(tooFewCandidates(input)).toBe(true);
  });

  it('makes the picks first, then drafts from them', async () => {
    const report = await ensurePlacePicks(
      harness.pool,
      { gateway: recorded() },
      daLat.destinationId,
      silent,
      noQueue,
    );
    expect(report).toMatchObject({ status: 'picked', matched: NAMED_IN_ORDER.length });
    // Once picked there is nothing to make.
    expect(
      await ensurePlacePicks(harness.pool, {}, daLat.destinationId, silent, noQueue),
    ).toBeNull();

    const places = await loadDraftPlaces(harness.pool, daLat.destinationId, []);
    const names = places.map((poi) => poi.name);
    expect(names.sort()).toEqual([...NAMED_IN_ORDER, ...Object.values(FILL).flat()].sort());
    expect(places.every((poi) => !poi.editorial)).toBe(true);
    // The well-known places stand in for must-sees; the fill does not.
    const mustSee = places.filter((poi) => poi.mustSee).map((poi) => poi.name);
    expect(mustSee.sort()).toEqual([...NAMED_IN_ORDER].sort());

    // No editorial facts: each kind gets its usual hours (marked as a guess) and visit length.
    const lake = places.find((poi) => poi.name === 'Hồ Xuân Hương');
    expect(lake).toMatchObject({ durationMin: 150, hoursGuessed: true });
    expect(lake?.hours?.weekly['mo']).toEqual([{ start: '07:00', end: '17:30' }]);
    const pho = places.find((poi) => poi.name === 'Phở Hiếu');
    expect(pho).toMatchObject({ durationMin: 75, hoursGuessed: true });
    expect(pho?.hours?.weekly['su']).toEqual([{ start: '07:00', end: '22:00' }]);
    const bar = places.find((poi) => poi.name === 'Maze Bar');
    expect(bar?.hours?.weekly['fr']).toEqual([{ start: '18:00', end: '24:00' }]);

    const { input } = await load(stepContext({ trip_id: tripId }));
    expect(tooFewCandidates(input)).toBe(false);
    const activities = input.pools.activities.map((poi) => poi.name);
    expect(activities).toEqual(
      expect.arrayContaining([
        'Hồ Xuân Hương',
        'Chùa Linh Phước',
        'Chợ Đà Lạt',
        'Datanla Waterfall',
      ]),
    );
    expect(input.pools.meals.map((poi) => poi.name)).toEqual(
      expect.arrayContaining(['Phở Hiếu', 'Nem Nướng Bà Hùng']),
    );
  });

  it('deals the swipe deck from the picks', async () => {
    const cards = await withSystem(harness.pool, (tx) =>
      deckCandidates(tx, {
        destination_id: daLat.destinationId,
        version_id: null,
        trip_id: tripId,
      }),
    );
    const names = cards.map((card) => card.name);
    expect(names).toEqual(expect.arrayContaining(['Hồ Xuân Hương', 'Phở Hiếu', 'Langbiang']));
    // Never a stay, a station or a row nobody picked.
    expect(names).not.toContain('Khách Sạn Sương Mai');
    expect(names).not.toContain('Ga Đà Lạt');
    expect(names).not.toContain('Văn Phòng Công Chứng');
    expect(names).toHaveLength(NAMED_IN_ORDER.length + Object.values(FILL).flat().length);
  });

  it('redrafts a day the draft left empty', { timeout: 120_000 }, async () => {
    const drafted = await load(stepContext({ trip_id: tripId }));
    const { frame } = drafted.input;
    const lake = [...drafted.input.pois.values()].find((poi) => poi.name === 'Hồ Xuân Hương');
    const second = scheduleDay({
      dayNo: 2,
      date: frame.dates[1] as string,
      theme: 'Around the lake',
      choices: [
        { poiId: lake?.id as string, kind: 'activity', mustDoId: null, note: null, when: 'any' },
      ],
      pois: drafted.input.pois,
      window: dayWindow(frame, 1),
      travel: drafted.input.travel,
      bands: drafted.input.bands,
      currency: frame.currency,
      tz: frame.tz,
      idFor: () => randomUUID(),
    });
    expect(second.items).toHaveLength(1);
    const itinerary: Itinerary = {
      currency: frame.currency,
      days: frame.dates.map((date, index) =>
        index === 1 ? second : { day_no: index + 1, date, theme: '', items: [] },
      ),
    };
    // The trip has its days already: an empty plan nobody put a stop on.
    const emptyPlan = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO itinerary_versions (trip_id, visibility, status, origin)
         VALUES ($1, 'organiser', 'draft', 'dates') RETURNING id`,
        [tripId],
      );
      const id = rows[0]?.id as string;
      await tx.query(
        'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, $3)',
        [id, tripId, frame.dates[0]],
      );
      await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, id]);
      return id;
    });
    const saved = await withSystem(harness.pool, (tx) =>
      persistDraft(tx, {
        jobId: randomUUID(),
        trip: drafted.trip,
        input: drafted.input,
        outcome: {
          itinerary,
          first: { ok: true, violations: [], costPpMinor: 0 },
          loops: 0,
          dropped: [],
        },
        stays: [],
        closures: [],
        slotAvailable: [],
      }),
    );
    const versionId = saved?.versionId as string;
    // The guide's draft takes the empty plan's place: the history holds the draft alone.
    const { rows: versions } = await harness.pool.query(
      `SELECT id, origin, parent_id FROM itinerary_versions
        WHERE trip_id = $1 AND (id = $2 OR id = $3)`,
      [tripId, versionId, emptyPlan],
    );
    expect(versions).toEqual([{ id: versionId, origin: 'guide', parent_id: null }]);

    const base = await loadBaseDraft(
      harness.pool,
      organiser,
      tripId,
      drafted.trip.crewId,
      versionId,
      drafted.input.travel,
    );
    expect(base?.itinerary.days.map((day) => [day.day_no, day.items.length])).toEqual(
      frame.dates.map((_, index) => [index + 1, index === 1 ? 1 : 0]),
    );
    expect(base?.itinerary.days[0]).toMatchObject({ day_no: 1, date: frame.dates[0], items: [] });

    // The empty first day redrafts: its day comes from the version, its places from the pools.
    const redraft = {
      ...drafted.input,
      base: base?.itinerary as Itinerary,
      dayNo: 1,
      reasons: ['surprise_me' as const],
      note: null,
      chat: [],
    };
    const request = JSON.stringify(buildRedraftRequest(redraft).messages);
    expect(request).toContain('## The day now\\n- no stops');
    // Its candidates come from the pools (those open on the landing day, which stays near the
    // stay); the lake is on day two, so day one may not use it.
    const offered = drafted.input.pools.activities.filter(
      (poi) =>
        poi.name !== 'Hồ Xuân Hương' &&
        (drafted.input.pools.openDays.get(poi.id) ?? []).includes(1),
    );
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.some((poi) => request.includes(poi.name))).toBe(true);
    expect(request).not.toContain('Hồ Xuân Hương');

    // Only an organiser of the trip reads the version's days.
    const stranger = randomUUID();
    await harness.pool.query(
      "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Stranger Test')",
      [stranger],
    );
    const { rows: empties } = await harness.pool.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'drafting')
       RETURNING id`,
      [tripId],
    );
    await harness.pool.query(
      'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, $3)',
      [empties[0]?.id, tripId, frame.dates[0]],
    );
    const args = [
      tripId,
      drafted.trip.crewId,
      empties[0]?.id as string,
      drafted.input.travel,
    ] as const;
    expect((await loadBaseDraft(harness.pool, organiser, ...args))?.itinerary.days).toHaveLength(1);
    expect(await loadBaseDraft(harness.pool, stranger, ...args)).toBeNull();
  });
});
