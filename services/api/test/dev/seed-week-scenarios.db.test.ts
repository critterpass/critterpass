/**
 * The week-long start scenarios on a real database: a seven-day trip locked in at the
 * destination's editorial places with no photos first and the longest names next, for a crew of
 * five with long Vietnamese names and for a crew of one, read back as the caller under RLS; asking
 * again builds nothing twice.
 */
import { withSystem, withUser } from '@cp/db';
import { CREW_NAME_MAX, GIVEN_NAME_MAX, generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerInviteCommands } from '../../src/commands/invites';
import { registerOnboardingCommands } from '../../src/commands/onboarding';
import { registerDevRoutes } from '../../src/dev/routes';
import { SCENARIO_CREW_NAMES } from '../../src/dev/scenario-crew';
import { WEEK_CREWMATES, WEEK_DAYS } from '../../src/dev/scenario-week-trip';
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
const LONG = 'Khu Du Lịch Sinh Thái Suối Khoáng Nóng Núi Thần Tài';
const LONGER = 'Bảo Tàng Điêu Khắc Chăm Đà Nẵng và Vườn Tượng Ngoài Trời';
const PHOTOGRAPHED = 'Cầu Vàng trên đỉnh Bà Nà Hills giữa mây trời bốn mùa';

let harness: CommandDoorsHarness;
let producer: PgBoss;

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => {
      registerOnboardingCommands(registry);
      registerInviteCommands(registry, testInviteDeps);
    },
    (app, deps) => registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
       VALUES ('da-nang', 'Đà Nẵng', 'Vietnam', 'live', 'VND', $1) ON CONFLICT (slug) DO NOTHING`,
      [TZ],
    );
    // Sixteen editorial places: the longest-named one has photos, so the week leaves it out.
    const names = [
      PHOTOGRAPHED,
      LONGER,
      LONG,
      ...Array.from({ length: 13 }, (_, i) => `Sight ${String(i + 1)}`),
    ];
    for (const [index, name] of names.entries()) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, status)
         SELECT id, $1, 'nature', $2, $3, 'editorial', 'active' FROM destinations WHERE slug = 'da-nang'
         RETURNING id`,
        [name, 16.05 + index * 0.001, 108.24 + index * 0.001],
      );
      if (name === PHOTOGRAPHED)
        await tx.query(
          `INSERT INTO poi_foursquare_photos (poi_id, fsq_photo_id, prefix, suffix, width, height, rank)
           VALUES ($1, 'photo-1', 'https://fastly.4sqi.net/img/general/', '/photo.jpg', 800, 600, 1)`,
          [rows[0]?.id],
        );
    }
  });
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

async function send(who: SignedIn, cmd: string, payload: unknown): Promise<number> {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(envelope(cmd, payload, { actor: { uid: who.uid, via: 'app' } })),
  });
  return response.status;
}

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

async function seed(who: SignedIn, scenario: StartScenario): Promise<SeedStartResult> {
  const response = await harness.request('/v1/dev/seed-demo', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ scenario }),
  });
  const body = await response.text();
  // A refused seed names the error the api logged.
  const logged = response.status === 200 ? '' : JSON.stringify(harness.logs.slice(-2));
  expect(response.status, `${body} ${logged}`).toBe(200);
  return JSON.parse(body) as SeedStartResult;
}

function seenBy(uid: string, seeded: SeedStartResult) {
  return withUser(harness.pool, uid, 'device-1', async (tx) => {
    const trip = await tx.query<{ status: string; days: number; crew: string }>(
      `SELECT t.status, (t.end_date - t.start_date + 1)::int AS days, c.name AS crew
         FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
      [seeded.trip_id],
    );
    const members = await tx.query<{ display_name: string }>(
      `SELECT u.display_name FROM crew_members m JOIN users u ON u.id = m.user_id
        WHERE m.crew_id = $1 AND m.status = 'active' ORDER BY m.created_at`,
      [seeded.crew_id],
    );
    const stops = await tx.query<{ day_no: number; name: string }>(
      `SELECT d.day_no, p.name FROM trips t
         JOIN plan_items i ON i.version_id = t.current_version_id
         JOIN plan_days d ON d.id = i.day_id
         JOIN pois p ON p.id = i.poi_id
        WHERE t.id = $1 ORDER BY d.day_no, i.starts_at`,
      [seeded.trip_id],
    );
    return { trip: trip.rows[0], members: members.rows, stops: stops.rows };
  });
}

describe('week-long start scenarios', { timeout: 180_000 }, () => {
  it('names its crews and people as long as the app lets them be', () => {
    for (const name of [SCENARIO_CREW_NAMES.week_crew, SCENARIO_CREW_NAMES.week_solo])
      expect([...name].length).toBeLessThanOrEqual(CREW_NAME_MAX);
    for (const name of WEEK_CREWMATES) expect([...name].length).toBeLessThanOrEqual(GIVEN_NAME_MAX);
  });

  it('week_crew: five people on a locked week at the long-named places without photos', async () => {
    const caller = await newAccount('Week Tester');
    const seeded = await seed(caller, 'week_crew');
    const seen = await seenBy(caller.uid, seeded);
    expect(seen.trip).toEqual({
      status: 'confirmed',
      days: WEEK_DAYS,
      crew: SCENARIO_CREW_NAMES.week_crew,
    });
    expect(seen.members.map((m) => m.display_name)).toEqual(['Week Tester', ...WEEK_CREWMATES]);
    expect(seen.stops).toHaveLength(WEEK_DAYS * 2);
    expect(new Set(seen.stops.map((stop) => stop.day_no)).size).toBe(WEEK_DAYS);
    const names = seen.stops.map((stop) => stop.name);
    expect(names).not.toContain(PHOTOGRAPHED);
    // The longest names lead: the first two mornings.
    const firstOfDay = (day: number) => seen.stops.find((stop) => stop.day_no === day)?.name;
    expect([firstOfDay(1), firstOfDay(2)]).toEqual([LONGER, LONG]);

    const again = await seed(caller, 'week_crew');
    expect(again).toMatchObject({ trip_id: seeded.trip_id, created: false });
    expect((await seenBy(caller.uid, again)).members).toHaveLength(5);
  });

  it('week_solo: the same week for a crew of one', async () => {
    const caller = await newAccount('Week Solo');
    const seeded = await seed(caller, 'week_solo');
    const seen = await seenBy(caller.uid, seeded);
    expect(seen.trip).toMatchObject({ status: 'confirmed', days: WEEK_DAYS });
    expect(seen.members).toEqual([{ display_name: 'Week Solo' }]);
    expect(seen.stops).toHaveLength(WEEK_DAYS * 2);
  });
});
