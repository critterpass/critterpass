/**
 * `GET /v1/public/proposal/{token}` against the real stack: a live trip code or open seat answers
 * the sent draft's first days, uncached; a code switched off after a first view answers 404 on the
 * next request, as does any code that never pointed at a trip.
 *
 * `GET /v1/public/plan/{token}`: a live link to a published crew plan answers the plan's days and
 * places and nothing the crew did not publish; a link to a plan still waiting on consent, a
 * revoked link and an unknown token answer 404, as does the same link once the plan is taken down.
 *
 * `GET /v1/catalog/perks`: the switched-on perk lines for the website, and none that is switched off.
 */
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPublicPreviewRoutes } from '../../src/routes/public-previews';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

// A seat token in its real shape (44 url-safe characters, then the key id).
const SEAT = `${'s'.repeat(44)}k1`;

// Plan link tokens in their real shape (24 url-safe characters); only their hashes are stored.
const PLAN_TOKEN = 'p'.repeat(24);
const PENDING_TOKEN = 'q'.repeat(24);
const REVOKED_TOKEN = 'r'.repeat(24);
const POI_ID = '0190a6f1-7aaa-7bbb-8ccc-123456789abc';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

let harness: CommandDoorsHarness;
let publishedPlan = '';

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerPublicPreviewRoutes(app, deps),
  );
  const one = async (sql: string, params: unknown[] = []) =>
    (await harness.pool.query<{ id: string }>(sql, params)).rows[0]!.id;
  const organiser = await one(
    "INSERT INTO users (id, status, display_name) VALUES (uuidv7(), 'registered', 'Winston Lee') RETURNING id",
  );
  const crew = await one(
    "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
    [organiser],
  );
  const trip = await one(
    "INSERT INTO trips (crew_id, status, start_date, end_date) VALUES ($1, 'voting', '2026-10-12', '2026-10-19') RETURNING id",
    [crew],
  );
  const version = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [trip],
  );
  for (const [dayNo, theme] of [
    [1, 'Villa, pool, nothing else'],
    [2, 'Batur sunrise hike'],
    [3, 'Boat day to Penida'],
    [4, 'Ubud rice terraces'],
  ] as const) {
    await harness.pool.query(
      "INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, $3, '2026-10-12'::date + $3::int - 1, $4)",
      [version, trip, dayNo, theme],
    );
  }
  await harness.pool.query(
    `INSERT INTO proposals (trip_id, created_by, reply_by, status, sent_at, version_id)
     VALUES ($1, $2, now() + interval '7 days', 'sent', now(), $3)`,
    [trip, organiser, version],
  );
  for (const code of ['BXP6XA', 'BXP6XB']) {
    await harness.pool.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
       VALUES ($1, 'trip', $2, $3, $4)`,
      [code, trip, crew, organiser],
    );
  }
  await harness.pool.query(
    `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
     VALUES ('BXP6XC', 'crew', $1, $1, $2)`,
    [crew, organiser],
  );
  await harness.pool.query(
    `INSERT INTO invites (crew_id, trip_id, inviter_id, kind, seat_token_hash, status, expires_at)
     VALUES ($1, $2, $3, 'personal', $4, 'pending', now() + interval '14 days')`,
    [crew, trip, organiser, hash(SEAT)],
  );

  const destination = await one(
    "INSERT INTO destinations (slug, name) VALUES ('public-kyoto', 'Kyoto') RETURNING id",
  );
  // What `materialise` stores for a crew that turned names on: the public copy, with fields the
  // web never shows (cost, photo keys, tips, place ids).
  const projection = {
    v: 1,
    destination_id: destination,
    destination_name: 'Kyoto',
    days_count: 2,
    travel_month: 4,
    travel_year: 2026,
    crew_size: 3,
    crew_names: ['Maya', 'Arjun', 'Jess'],
    cost_pp_rounded_minor: 124000,
    currency: 'USD',
    travelled: true,
    tags: ['easy_pace', 'temples'],
    days: [
      {
        day_no: 1,
        theme: 'Temples before the crowds',
        places: [
          { poi_id: POI_ID, name: 'Fushimi Inari', category: 'temple_shrine' },
          { poi_id: POI_ID, name: 'Nishiki Market', category: 'market' },
        ],
      },
      { day_no: 2, theme: null, places: [] },
    ],
    photos: ['trips/secret/photo-1.jpg'],
    tips: [{ poi_id: POI_ID, text: 'Go at dawn.' }],
  };
  publishedPlan = await one(
    `INSERT INTO shared_plans (trip_id, destination_id, requested_by, status, title, days_count,
       travel_month, travel_year, crew_size, cost_pp_rounded_minor, currency, tags, projection,
       travelled, rating_avg, rating_count, copies_count, published_at)
     VALUES ($1, $2, $3, 'published', 'Kyoto, slowly', 2, 4, 2026, 3, 124000, 'USD',
       '{easy_pace,temples}', $4, true, 4.5, 2, 7, now()) RETURNING id`,
    [trip, destination, organiser, JSON.stringify(projection)],
  );
  const otherTrip = await one(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew],
  );
  const pendingPlan = await one(
    `INSERT INTO shared_plans (trip_id, destination_id, requested_by, projection)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [otherTrip, destination, organiser, JSON.stringify(projection)],
  );
  await harness.pool.query(
    `INSERT INTO plan_links (trip_id, shared_plan_id, token_hash, revoked_at)
     VALUES ($1, $2, $3, NULL), ($4, $5, $6, NULL), ($1, $2, $7, now())`,
    [
      trip,
      publishedPlan,
      hash(PLAN_TOKEN),
      otherTrip,
      pendingPlan,
      hash(PENDING_TOKEN),
      hash(REVOKED_TOKEN),
    ],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const get = (path: string) => harness.request(path, { headers: { 'x-real-ip': '198.51.100.7' } });

describe('GET /v1/public/proposal/{token}', () => {
  it('answers the first three days of the sent draft for a live trip code, uncached', async () => {
    const response = await get('/v1/public/proposal/bxp-6xa');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      kind: 'proposal',
      days_total: 4,
      days: [
        { day_no: 1, date: '2026-10-12', theme: 'Villa, pool, nothing else', stops: [] },
        { day_no: 2, date: '2026-10-13', theme: 'Batur sunrise hike', stops: [] },
        { day_no: 3, date: '2026-10-14', theme: 'Boat day to Penida', stops: [] },
      ],
    });
  });

  it('answers an open personal seat by its token', async () => {
    const response = await get(`/v1/public/proposal/BXP6XA?seat=${SEAT}`);
    expect(response.status).toBe(200);
  });

  it('answers 404 once the code is switched off', async () => {
    expect((await get('/v1/public/proposal/BXP6XB')).status).toBe(200);
    await harness.pool.query("UPDATE join_codes SET status = 'revoked' WHERE code = 'BXP6XB'");
    expect((await get('/v1/public/proposal/BXP6XB')).status).toBe(404);
  });

  it('answers 404 for a crew code, an unknown code and a malformed one', async () => {
    for (const token of ['BXP6XC', 'ZZZZ2K', 'not-a-code']) {
      expect((await get(`/v1/public/proposal/${token}`)).status).toBe(404);
    }
  });

  it('rejects a kind it does not serve', async () => {
    expect((await get('/v1/public/payroll/BXP6XA')).status).not.toBe(200);
  });
});

describe('GET /v1/public/plan/{token}', () => {
  it("answers a published plan's days and places for a live link, uncached", async () => {
    const response = await get(`/v1/public/plan/${PLAN_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      kind: 'plan',
      shared_plan_id: publishedPlan,
      title: 'Kyoto, slowly',
      destination_name: 'Kyoto',
      days_count: 2,
      travel_month: 4,
      travel_year: 2026,
      crew_size: 3,
      crew_names: ['Maya', 'Arjun', 'Jess'],
      travelled: true,
      tags: ['easy_pace', 'temples'],
      days: [
        {
          day_no: 1,
          theme: 'Temples before the crowds',
          places: [
            { name: 'Fushimi Inari', category: 'temple_shrine' },
            { name: 'Nishiki Market', category: 'market' },
          ],
        },
        { day_no: 2, theme: null, places: [] },
      ],
      rating_avg: 4.5,
      rating_count: 2,
      copies_count: 7,
    });
  });

  it('never carries costs, photos, tips or place ids', async () => {
    const body = await (await get(`/v1/public/plan/${PLAN_TOKEN}`)).text();
    for (const secret of ['cost', 'currency', 'photo', 'tips', 'Go at dawn', 'poi_id', 'trip_id']) {
      expect(body).not.toContain(secret);
    }
  });

  it('answers 404 for a plan waiting on consent, a revoked link, an unknown and a malformed token', async () => {
    for (const token of [PENDING_TOKEN, REVOKED_TOKEN, 'z'.repeat(24), 'short', publishedPlan]) {
      expect((await get(`/v1/public/plan/${token}`)).status).toBe(404);
    }
  });

  it('answers 404 once the plan is taken down', async () => {
    await harness.pool.query(
      "UPDATE shared_plans SET status = 'unpublished', projection = '{}' WHERE id = $1",
      [publishedPlan],
    );
    expect((await get(`/v1/public/plan/${PLAN_TOKEN}`)).status).toBe(404);
  });
});

describe('GET /v1/catalog/perks', () => {
  interface PerkRow {
    readonly key: string;
    readonly tier: string;
    readonly copy_key: string;
    readonly sort: number;
  }
  const perks = async () => {
    const response = await get('/v1/catalog/perks');
    expect(response.status).toBe(200);
    return ((await response.json()) as { perks: PerkRow[] }).perks;
  };

  it('answers the switched-on perk lines in display order, without a session, cacheable', async () => {
    const response = await get('/v1/catalog/perks');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const rows = ((await response.json()) as { perks: PerkRow[] }).perks;
    expect(rows[0]).toEqual({
      key: 'pass_plus_guide_unlimited',
      tier: 'pass_plus',
      copy_key: 'monetize.perks.pass_plus_guide_unlimited',
      sort: 10,
    });
    expect(rows.map((row) => row.sort)).toEqual(
      [...rows.map((row) => row.sort)].sort((a, b) => a - b),
    );
    expect(new Set(rows.map((row) => row.tier))).toEqual(
      new Set(['pass_plus', 'boost', 'ftf', 'crew_year']),
    );
  });

  it('leaves a perk out once it is switched off', async () => {
    expect((await perks()).map((row) => row.key)).toContain('boost_live_map');
    await harness.pool.query("UPDATE perks SET is_shipped = false WHERE key = 'boost_live_map'");
    expect((await perks()).map((row) => row.key)).not.toContain('boost_live_map');
  });
});
