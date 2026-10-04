/**
 * Trip cost reads, change previews and the guide's `cost_quote` / `fit_check` tools over the real
 * stack: a member reads their own share and everyone's totals but never another member's lines or
 * personal options; the rain ChangeSet previews at "+$22 each, 1 booking moved, 0 must-dos
 * touched"; and tool outputs carry only engine numbers for the asking member.
 */
import { createToolRegistry, type ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import { toLocalWallTime, type FitGrade, type FitReason } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCostRoutes } from '../../src/cost/routes';
import { registerCostToolExecutors } from '../../src/cost/tool-executors';
import { DEFAULT_FIT_DEPS } from '../../src/planning/fit/routes';
import { fitForTrip } from '../../src/planning/fit/service';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

interface FitOut {
  readonly grade: FitGrade;
  readonly day_no: number | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly reasons: readonly FitReason[];
}

let harness: CommandDoorsHarness;
let registry: ToolRegistry;
let organiser: SignedIn;
let member: SignedIn;
let outsider: SignedIn;
let tripId: string;
let draftTripId: string;
let poiId: string;
const ids = {
  walk: '0195f000-0000-7000-8000-000000000001',
  museum: '0195f000-0000-7000-8000-000000000002',
  dinner: '0195f000-0000-7000-8000-000000000003',
  inari: '0195f000-0000-7000-8000-000000000004',
};
/** A value only the organiser's private share calc holds; it must never reach anyone else. */
const ORGANISER_SECRET = -987_654;

async function one(sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  return rows[0]?.id ?? '';
}

async function seedTrip(withPlan: boolean): Promise<string> {
  const crewId = await one(
    "INSERT INTO crews (name, created_by, settlement_currency) VALUES ('Kyoto', $1, 'USD') RETURNING id",
    [organiser.uid],
  );
  const trip = await one(
    "INSERT INTO trips (crew_id, status, tz, start_date, end_date) VALUES ($1, 'setup', 'Asia/Tokyo', '2027-04-05', '2027-04-09') RETURNING id",
    [crewId],
  );
  for (const [uid, role] of [
    [organiser.uid, 'organiser'],
    [member.uid, 'member'],
  ] as const) {
    await harness.pool.query(
      'INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)',
      [crewId, uid, role],
    );
    await harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [trip, uid, role],
    );
  }
  if (!withPlan) return trip;
  const versionId = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [trip],
  );
  // A Monday with nothing planned: the museum is closed that day.
  await one(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2027-04-05') RETURNING id",
    [versionId, trip],
  );
  const day3 = await one(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 3, '2027-04-07') RETURNING id",
    [versionId, trip],
  );
  const day4 = await one(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 4, '2027-04-08') RETURNING id",
    [versionId, trip],
  );
  const insert = `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, cost_model, amount_minor, currency, booking_id, must_do_id)
    VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', $7, $8, $9, $10, $11)`;
  await harness.pool.query(insert, [
    versionId,
    day3,
    trip,
    ids.walk,
    '2027-04-07T14:00:00+09:00',
    '2027-04-07T16:00:00+09:00',
    'per_person',
    0,
    'USD',
    null,
    null,
  ]);
  await harness.pool.query(insert, [
    versionId,
    day3,
    trip,
    ids.dinner,
    '2027-04-07T19:00:00+09:00',
    '2027-04-07T21:00:00+09:00',
    'group',
    36_000,
    'USD',
    '0195f000-0000-7000-8000-0000000000b1',
    null,
  ]);
  await harness.pool.query(insert, [
    versionId,
    day4,
    trip,
    ids.inari,
    '2027-04-08T06:00:00+09:00',
    '2027-04-08T08:00:00+09:00',
    null,
    null,
    null,
    null,
    '0195f000-0000-7000-8000-0000000000d1',
  ]);
  await harness.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    versionId,
    trip,
  ]);
  return trip;
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerCostRoutes(app, deps),
  );
  organiser = await harness.signInAnonymously();
  member = await harness.signInAnonymously();
  outsider = await harness.signInAnonymously();
  tripId = await seedTrip(true);
  draftTripId = await seedTrip(false);
  for (const [uid, total, secret] of [
    [organiser.uid, 131_000, ORGANISER_SECRET],
    [member.uid, 117_000, -6_400],
  ] as const) {
    await harness.pool.query(
      `INSERT INTO share_calcs (trip_id, user_id, version, components, personal_option_deltas, total_minor, currency)
       VALUES ($1, $2, 'cv_1', '[{"component_key":"food","kind":"food","amount_minor":"13600"}]', $3, $4, 'USD')`,
      [tripId, uid, JSON.stringify([{ option_id: 'skip-nara', delta_minor: secret }]), total],
    );
    await harness.pool.query(
      "INSERT INTO trip_share_totals (trip_id, user_id, total_minor, currency, calc_version) VALUES ($1, $2, $3, 'USD', 'cv_1')",
      [tripId, uid, total],
    );
  }
  await harness.pool.query(
    `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared, amount_minor, currency, source, seen_at)
     VALUES ($1, 'cv_1', 'food', 'food', 'person', false, 13600, 'USD', 'editorial', now() - interval '30 days'),
            ($1, 'cv_1', 'quote:flight:SIN', 'flight', 'person', false, 52000, 'USD', 'travelpayouts', now() - interval '80 hours')`,
    [tripId],
  );
  const dest = await one(
    "INSERT INTO destinations (slug, name) VALUES ('kyoto', 'Kyoto') RETURNING id",
  );
  poiId = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng, timezone, hours)
     VALUES ($1, 'Railway Museum', 'museum', 34.98, 135.74, 'Asia/Tokyo', $2) RETURNING id`,
    [
      dest,
      JSON.stringify({
        weekly: Object.fromEntries(
          ['tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '10:00', end: '17:00' }]]),
        ),
      }),
    ],
  );
  registry = createToolRegistry();
  registerCostToolExecutors(registry, harness.pool);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const get = (path: string, who?: SignedIn) =>
  harness.request(path, who ? { headers: { cookie: who.cookie } } : {});

describe('GET /v1/trips/{id}/costs', () => {
  it("gives a member their own share and everyone's totals, never another member's lines", async () => {
    const response = await get(`/v1/trips/${tripId}/costs`, member);
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).toMatchObject({
      version: 'cv_1',
      mine: {
        total: { amount_minor: 117_000, currency: 'USD' },
        lines: [{ component_key: 'food', kind: 'food', amount_minor: 13_600 }],
        personal_option_deltas: [{ option_id: 'skip-nara', delta_minor: -6_400 }],
      },
      totals: expect.arrayContaining([
        {
          user_id: organiser.uid,
          total: { amount_minor: 131_000, currency: 'USD' },
          is_missing: false,
        },
      ]) as unknown,
      freshness: { stale: true },
    });
    expect(text).not.toContain(String(ORGANISER_SECRET));
  });

  it('is not found for an outsider, needs a session, and flags a stale version', async () => {
    expect((await get(`/v1/trips/${tripId}/costs`, outsider)).status).toBe(404);
    expect((await get(`/v1/trips/${tripId}/costs`)).status).toBe(401);
    expect((await get(`/v1/trips/${tripId}/costs?version=cv_0`, member)).status).toBe(409);
  });
});

describe('POST /v1/trips/{id}/costs/preview', () => {
  it('rain on Wednesday: +$22 each, 1 booking moved, 0 must-dos touched', async () => {
    const ops = [
      {
        op: 'remove',
        target: ids.walk,
        reason: 'rain',
        affected_user_ids: [],
        booking_impact: false,
      },
      {
        op: 'add',
        target: ids.museum,
        after: {
          day_no: 3,
          starts_at: '2027-04-07T14:00:00+09:00',
          ends_at: '2027-04-07T16:00:00+09:00',
          cost_model: 'per_person',
          amount_minor: 2_200,
          currency: 'USD',
        },
        reason: 'indoors',
        affected_user_ids: [],
        booking_impact: false,
      },
      {
        op: 'retime',
        target: ids.dinner,
        after: { starts_at: '2027-04-07T19:30:00+09:00', ends_at: '2027-04-07T21:30:00+09:00' },
        reason: 'slow taxis',
        affected_user_ids: [],
        booking_impact: true,
      },
    ];
    const response = await harness.request(`/v1/trips/${tripId}/costs/preview`, {
      method: 'POST',
      headers: { cookie: member.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      currency: 'USD',
      mine: { delta_minor: 2_200, display_delta_minor: 2_200 },
      each_minor: 2_200,
      bookings_moved: 1,
      must_dos_touched: 0,
      driving_delta_min: 0,
    });
  });
});

describe('guide tools', () => {
  const context = (who: SignedIn, trip: string) =>
    ({ uid: who.uid, tripId: trip, caller: 'C', route: 'guide.chat' }) as const;

  it('cost_quote returns only the asking member’s delta from the engine', async () => {
    const result = await registry.execute(
      {
        id: 'c1',
        name: 'cost_quote',
        input: {
          trip_id: tripId,
          ops: [{ op: 'remove', item: ids.dinner, reason: 'skip', source_ids: [] }],
        },
      },
      context(member, tripId),
    );
    expect(result.ok).toBe(true);
    const output = result.ok ? result.output : null;
    expect(output).toEqual({ delta_per_person_minor: -18_000, currency: 'USD' });
    expect(JSON.stringify(output)).not.toContain(String(ORGANISER_SECRET));
  });

  it("fit_check: the fit engine's answer for the asked day, with local times and reasons", async () => {
    const wednesday = await registry.execute(
      { id: 'f1', name: 'fit_check', input: { trip_id: tripId, poi_id: poiId, day: 3 } },
      context(member, tripId),
    );
    const out = wednesday.ok ? (wednesday.output as FitOut) : null;
    expect(out?.grade).not.toBe('no');
    expect(out?.day_no).toBe(3);
    // The museum opens 10:00 to 17:00, and the walk at 14:00 is already in the plan.
    expect(out?.starts_at && out.starts_at >= '10:00' && out.starts_at < '17:00').toBe(true);
    expect(out?.ends_at && out.ends_at <= '17:00').toBe(true);
    // The same slot the planning screens get from the fit engine for that day.
    const engine = await withUser(harness.pool, member.uid, 'test', (tx) =>
      fitForTrip(tx, { tripId, poiIds: [poiId] }, DEFAULT_FIT_DEPS),
    );
    const day3 = engine.fits[0]?.days.find((day) => day.day_no === 3);
    expect(day3?.grade).toBe(out?.grade);
    expect(day3?.slot && toLocalWallTime(new Date(day3.slot.starts_at), 'Asia/Tokyo').time).toBe(
      `${out?.starts_at}:00`,
    );

    const monday = await registry.execute(
      { id: 'f2', name: 'fit_check', input: { trip_id: tripId, poi_id: poiId, day: 1 } },
      context(member, tripId),
    );
    expect(monday.ok && monday.output).toMatchObject({
      grade: 'no',
      day_no: 1,
      starts_at: null,
      ends_at: null,
      reasons: [{ code: 'closed_that_day', params: { day_no: 1 } }],
    });

    const best = await registry.execute(
      { id: 'f3', name: 'fit_check', input: { trip_id: tripId, poi_id: poiId } },
      context(member, tripId),
    );
    expect(best.ok && (best.output as FitOut).day_no).toBe(engine.fits[0]?.best?.day_no);

    const preDraft = await registry.execute(
      { id: 'f4', name: 'fit_check', input: { trip_id: draftTripId, poi_id: poiId } },
      context(member, draftTripId),
    );
    expect(preDraft.ok && preDraft.output).toEqual({
      grade: 'good',
      day_no: null,
      starts_at: null,
      ends_at: null,
      reasons: [],
    });
  });

  it('refuses an outsider', async () => {
    const result = await registry.execute(
      { id: 'f5', name: 'fit_check', input: { trip_id: tripId, poi_id: poiId } },
      context(outsider, tripId),
    );
    expect(result.ok).toBe(false);
  });
});
