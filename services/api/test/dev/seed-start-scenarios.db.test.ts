/**
 * The start scenarios of `POST /v1/dev/seed-demo` on a real database: each builds what it says
 * for the caller (read back as the caller, under RLS), from editorial places that already exist
 * and never from places of its own; asking again builds nothing twice; a database without those
 * places leaves nothing behind; a second account joins with the answered code; and the route
 * refuses on production whatever mounted it.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { CommandDoorDeps } from '../../src/commands/_framework/doors';
import { registerInviteCommands } from '../../src/commands/invites';
import { registerOnboardingCommands } from '../../src/commands/onboarding';
import { registerDevRoutes } from '../../src/dev/routes';
import { SCENARIO_CREW_NAMES, SCENARIO_CREWMATES } from '../../src/dev/scenario-crew';
import type { SeedStartResult, StartScenario } from '../../src/dev/scenarios';
import { startJobProducer } from '../../src/jobs/producer';
import { testInviteDeps } from '../crews/invite-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const TZ = 'Asia/Ho_Chi_Minh';
const logger = { info: () => undefined, warn: () => undefined };

let harness: CommandDoorsHarness;
let doorDeps: CommandDoorDeps;
let producer: PgBoss;

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => {
      registerOnboardingCommands(registry);
      registerInviteCommands(registry, testInviteDeps);
    },
    (app, deps) => {
      doorDeps = deps;
      registerDevRoutes(app, { ...deps, appEnv: 'staging', logger });
    },
  );
  // The commands a scenario runs queue jobs, as on the api.
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  await withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
       VALUES ('da-nang', 'Đà Nẵng', 'Vietnam', 'live', 'VND', $1) ON CONFLICT (slug) DO NOTHING`,
      [TZ],
    ),
  );
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

function localDate(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

async function post(who: SignedIn, scenario: StartScenario): Promise<Response> {
  return harness.request('/v1/dev/seed-demo', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ scenario }),
  });
}

async function seed(who: SignedIn, scenario: StartScenario): Promise<SeedStartResult> {
  const response = await post(who, scenario);
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as SeedStartResult;
}

async function send(who: SignedIn, cmd: string, payload: unknown): Promise<number> {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(envelope(cmd, payload, { actor: { uid: who.uid, via: 'app' } })),
  });
  return response.status;
}

/** A new account with a pass issued from Ho Chi Minh City, as the dev build's "start as" makes. */
async function newAccount(name: string): Promise<SignedIn> {
  const who = await harness.signInAnonymously();
  const passId = generateUuidV7();
  expect(await send(who, 'start_pass', { pass_id: passId })).toBe(200);
  expect(
    await send(who, 'issue_pass', {
      pass_id: passId,
      given_name: name,
      avatar: { kind: 'initials' },
      taste_answers: [],
      home_iata: 'SGN',
    }),
  ).toBe(200);
  return who;
}

/** Four curated sights and two rows a scenario must never plan: open data, and a hidden one. */
async function addPlaces(): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const rows = [
      ['Mỹ Khê Beach', 'beach', 'editorial', 'active'],
      ['Marble Mountains', 'nature', 'editorial', 'active'],
      ['Linh Ứng Pagoda', 'temple_shrine', 'editorial', 'active'],
      ['Cham Museum', 'museum', 'editorial', 'active'],
      ['Open Data Beach', 'beach', 'auto', 'active'],
      ['Hidden Pagoda', 'temple_shrine', 'editorial', 'hidden'],
    ];
    for (const [index, [name, category, curation, status]] of rows.entries()) {
      await tx.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, status)
         SELECT id, $1, $2, $3, $4, $5, $6 FROM destinations WHERE slug = 'da-nang'`,
        [name, category, 16.05 + index * 0.01, 108.24 + index * 0.01, curation, status],
      );
    }
  });
}

interface TripSeen {
  status: string;
  start_date: string;
  end_date: string;
  local_currency: string;
  current_version_id: string | null;
  draft_version_id: string | null;
  settlement_currency: string;
}

/** What the caller reads of a seeded crew and trip, through RLS. */
function seenBy(uid: string, seeded: SeedStartResult) {
  return withUser(harness.pool, uid, 'device-1', async (tx) => {
    const trip = await tx.query<TripSeen>(
      `SELECT t.status, t.start_date::text, t.end_date::text, t.local_currency,
              t.current_version_id, t.draft_version_id, c.settlement_currency
         FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
      [seeded.trip_id],
    );
    const members = await tx.query<{ display_name: string; rsvp: string | null }>(
      `SELECT u.display_name, p.rsvp
         FROM crew_members m JOIN users u ON u.id = m.user_id
         LEFT JOIN trip_participants p ON p.user_id = m.user_id AND p.trip_id = $2
        WHERE m.crew_id = $1 AND m.status = 'active' ORDER BY m.created_at`,
      [seeded.crew_id, seeded.trip_id ?? null],
    );
    const stops = await tx.query<{ day_no: number; name: string; curation: string }>(
      `SELECT d.day_no, p.name, p.curation
         FROM trips t
         JOIN plan_items i ON i.version_id = coalesce(t.current_version_id, t.draft_version_id)
         JOIN plan_days d ON d.id = i.day_id
         JOIN pois p ON p.id = i.poi_id
        WHERE t.id = $1 AND i.booking_id IS NULL ORDER BY d.day_no, i.starts_at`,
      [seeded.trip_id],
    );
    const expenses = await tx.query<{ currency: string; amount: string; shares: number }>(
      `SELECT e.currency, e.amount_minor::text AS amount,
              (SELECT count(*)::int FROM expense_shares s WHERE s.expense_id = e.id) AS shares
         FROM expenses e WHERE e.trip_id = $1 ORDER BY e.amount_minor DESC`,
      [seeded.trip_id],
    );
    const bookings = await tx.query<{ type: string; legs: string[] }>(
      `SELECT b.type,
              coalesce((SELECT array_agg(s.dep_airport || '-' || s.arr_airport ORDER BY s.segment_no)
                          FROM flight_segments s WHERE s.booking_id = b.id), '{}') AS legs
         FROM bookings b WHERE b.trip_id = $1 ORDER BY b.type`,
      [seeded.trip_id],
    );
    return {
      trip: trip.rows[0],
      members: members.rows,
      stops: stops.rows,
      expenses: expenses.rows,
      bookings: bookings.rows,
    };
  });
}

describe('start scenarios', { timeout: 180_000 }, () => {
  it('refuses a trip scenario where the destination has no editorial places, leaving nothing', async () => {
    const caller = await newAccount('No Places');
    const response = await post(caller, 'trip_today');
    const body = (await response.json()) as { error: { code: string; detail?: unknown } };
    expect(body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'no_editorial_places', slug: 'da-nang' },
    });
    const { rows } = await harness.pool.query('SELECT 1 FROM crews WHERE created_by = $1', [
      caller.uid,
    ]);
    expect(rows).toHaveLength(0);
    await addPlaces();
  });

  it('trip_today: six people on a locked trip that is on today, with money and a stay', async () => {
    const caller = await newAccount('Today Tester');
    const seeded = await seed(caller, 'trip_today');
    expect(seeded).toMatchObject({ scenario: 'trip_today', created: true, inbox_item_ids: [] });
    expect(seeded.code).toMatch(/^[A-Z0-9]{6}$/);

    const seen = await seenBy(caller.uid, seeded);
    expect(seen.trip).toMatchObject({
      status: 'in_trip',
      start_date: localDate(0),
      end_date: localDate(2),
      local_currency: 'VND',
      settlement_currency: 'VND',
    });
    expect(seen.trip?.current_version_id).not.toBeNull();
    expect(seen.members.map((member) => member.display_name)).toEqual([
      'Today Tester',
      ...SCENARIO_CREWMATES,
    ]);
    expect(seen.members.every((member) => member.rsvp === 'in')).toBe(true);
    // Every stop is one of the destination's curated places, a stop on each day.
    expect(seen.stops.map((stop) => stop.name).sort()).toEqual([
      'Cham Museum',
      'Linh Ứng Pagoda',
      'Marble Mountains',
      'Mỹ Khê Beach',
    ]);
    expect(new Set(seen.stops.map((stop) => stop.day_no))).toEqual(new Set([1, 2, 3]));
    expect(seen.expenses).toEqual([
      { currency: 'VND', amount: '900000', shares: 6 },
      { currency: 'VND', amount: '300000', shares: 6 },
    ]);
    expect(seen.bookings).toEqual([{ type: 'stay', legs: [] }]);

    // Asked again: the same crew, trip and code, and nothing built twice.
    const again = await seed(caller, 'trip_today');
    expect(again).toMatchObject({
      crew_id: seeded.crew_id,
      trip_id: seeded.trip_id,
      code: seeded.code,
      created: false,
    });
    const after = await seenBy(caller.uid, again);
    expect(after.members).toHaveLength(6);
    expect(after.expenses).toHaveLength(2);
    expect(after.bookings).toHaveLength(1);
    const crews = await harness.pool.query(
      'SELECT 1 FROM crews WHERE created_by = $1 AND name = $2',
      [caller.uid, SCENARIO_CREW_NAMES.trip_today],
    );
    expect(crews.rows).toHaveLength(1);
  });

  it('trip_tomorrow: the same trip locked for tomorrow, with the flight in that morning', async () => {
    const caller = await newAccount('Tomorrow Tester');
    const seeded = await seed(caller, 'trip_tomorrow');
    const seen = await seenBy(caller.uid, seeded);
    expect(seen.trip).toMatchObject({
      status: 'confirmed',
      start_date: localDate(1),
      end_date: localDate(3),
      settlement_currency: 'VND',
    });
    expect(seen.members).toHaveLength(6);
    expect(seen.stops.length).toBeGreaterThanOrEqual(3);
    expect(seen.expenses).toHaveLength(2);
    expect(seen.bookings).toEqual([
      { type: 'flight', legs: ['SGN-DAD'] },
      { type: 'stay', legs: [] },
    ]);
    expect((await seed(caller, 'trip_tomorrow')).trip_id).toBe(seeded.trip_id);
  });

  it('draft_ready: a crew of one whose plan waits in review, not yet the crew plan', async () => {
    const caller = await newAccount('Draft Tester');
    const seeded = await seed(caller, 'draft_ready');
    const seen = await seenBy(caller.uid, seeded);
    expect(seen.trip).toMatchObject({ status: 'draft_review', current_version_id: null });
    expect(seen.trip?.draft_version_id).not.toBeNull();
    expect(seen.members.map((member) => member.display_name)).toEqual(['Draft Tester']);
    expect(seen.stops).toHaveLength(4);
    expect(seen.stops.every((stop) => stop.curation === 'editorial')).toBe(true);
    expect(seen.expenses).toHaveLength(0);
    expect((await seed(caller, 'draft_ready')).trip_id).toBe(seeded.trip_id);
  });

  it('crew_with_code: a crew with no trip whose code a second account joins with', async () => {
    const caller = await newAccount('Code Tester');
    const seeded = await seed(caller, 'crew_with_code');
    expect(seeded.trip_id).toBeUndefined();
    expect(seeded.code).toMatch(/^[A-Z0-9]{6}$/);
    expect((await seed(caller, 'crew_with_code')).code).toBe(seeded.code);

    const friend = await newAccount('Friend Tester');
    expect(await send(friend, 'accept_invite', { code: seeded.code })).toBe(200);
    const members = await withUser(harness.pool, friend.uid, 'device-2', async (tx) => {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM crew_members WHERE crew_id = $1 AND status = 'active'`,
        [seeded.crew_id],
      );
      return rows.map((row) => row.user_id);
    });
    expect(members.sort()).toEqual([caller.uid, friend.uid].sort());
  });

  it('refuses every scenario on production, before reading the session', async () => {
    const app = createApp({
      service: 'api',
      version: 'test',
      commit: 'test',
      logger: pino({ level: 'silent' }),
      readiness: {},
      exposeDocs: false,
      pool: harness.pool,
    });
    registerDevRoutes(app, { ...doorDeps, appEnv: 'production', logger });
    for (const scenario of ['trip_today', 'crew_with_code', 'everyday']) {
      const response = await app.request('http://localhost:8787/v1/dev/seed-demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    }
  });
});
