/**
 * Running late against a migrated Postgres, through the real routes: a replayed drive
 * (fixtures/drive-to-karsa-spa.gpx) sends its positions to `POST /v1/trips/{id}/journey-check`,
 * routed by the api's own straight-line estimator. The ETA has to be late twice in a row before
 * anything opens, the whole drive opens exactly one disruption, and no table ever holds where the
 * car was. Then the late member picks an option (the waiting crew is told at once, a changed pick
 * is a correction), is taken out again once on time, and a member's own "running late" report
 * opens the item's disruption without any journey.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { onEventAppended, resetEventAppendedHooksForTests, withSystem } from '@cp/db';
import { generateUuidV7, journeyCheckResultSchema, type JourneyCheckResult } from '@cp/domain';
import { lateOptions } from '@cp/planner';
import pino from 'pino';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDisruptionCommands } from '../../src/commands/disruptions';
import { disruptionReactHook, lateReportHook } from '../../src/commands/disruptions/hooks';
import { registerTripDayCommands } from '../../src/commands/trip-day';
import { startJobProducer } from '../../src/jobs/producer';
import { registerJourneyRoutes } from '../../src/routes/journey';
import { straightLineRoutingProvider } from '../../src/routing/eta';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const SPA = { lat: -8.5005, lng: 115.254 };
const STARTS_AT = '2026-10-15T06:00:00Z';

interface TrackPoint {
  readonly lat: number;
  readonly lng: number;
  readonly at: Date;
}

function readTrack(): TrackPoint[] {
  const gpx = readFileSync(
    fileURLToPath(new URL('./fixtures/drive-to-karsa-spa.gpx', import.meta.url)),
    'utf8',
  );
  return [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"><time>([^<]+)<\/time>/gu)].map(
    (match) => ({ lat: Number(match[1]), lng: Number(match[2]), at: new Date(match[3] ?? '') }),
  );
}

let harness: CommandDoorsHarness;
let boss: PgBoss;
let wes: SignedIn;
let jordan: SignedIn;
let rin: SignedIn;
let outsider: SignedIn;
let tripId: string;
let crewId: string;
let itemId: string;
let clock = new Date('2026-10-15T05:00:00Z');

async function check(who: SignedIn, point: TrackPoint, item = itemId) {
  clock = point.at;
  // The limit is one check per 30 real seconds; the replay runs a whole drive in one go.
  await harness.redis.del(`journey:${who.uid}`);
  const response = await harness.request(`/v1/trips/${tripId}/journey-check`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ item_id: item, lat: point.lat, lng: point.lng, mode: 'drive' }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function run(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        op_id: generateUuidV7(),
        actor: { uid: who.uid, via: 'app' },
        device: { id: randomUUID(), platform: 'ios', app_version: '1.0.0', tz: 'Asia/Makassar' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const codeOf = (body: Record<string, unknown>) =>
  (body['error'] as { code?: string } | undefined)?.code;

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

interface LateRow {
  id: string;
  status: string;
  cause: string;
  affected: { traveller_ids: string[]; unaffected_ids: string[] };
  facts: Record<string, string | number>;
  chosen_option_id: string | null;
}

const lateDisruptions = () =>
  all<LateRow>(
    `SELECT id, status, cause, affected, facts, chosen_option_id FROM disruptions
      WHERE trip_id = $1 AND kind = 'running_late' ORDER BY created_at`,
    [tripId],
  );

/** Read as the owner: no application role may read the event log. */
async function eventCount(type: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM domain_events WHERE trip_id = $1 AND type = $2',
    [tripId, type],
  );
  return rows[0]?.n ?? 0;
}

const chatLines = () =>
  all<{ body: string }>(
    "SELECT body FROM messages WHERE crew_id = $1 AND ref_kind = 'disruption' ORDER BY seq",
    [crewId],
  );

beforeAll(async () => {
  resetEventAppendedHooksForTests();
  harness = await startCommandDoors(
    (registry) => {
      registerDisruptionCommands(registry);
      registerTripDayCommands(registry);
    },
    (app, deps) =>
      registerJourneyRoutes(app, {
        ...deps,
        routing: straightLineRoutingProvider,
        now: () => clock,
      }),
  );
  onEventAppended(disruptionReactHook);
  onEventAppended(lateReportHook);
  boss = await startJobProducer({
    connectionString: harness.pool.options.connectionString as string,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  [wes, jordan, rin, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const pool = harness.pool;
  for (const [who, name] of [
    [wes, 'Wes'],
    [jordan, 'Jordan'],
    [rin, 'Rin'],
  ] as const) {
    await pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [who.uid, name]);
  }
  const one = async (sql: string, params: unknown[]) =>
    (await pool.query<{ id: string }>(sql, params)).rows[0]?.id as string;
  const destinationId = await one(
    "INSERT INTO destinations (slug, name, tz) VALUES ($1, 'Ubud', 'Asia/Makassar') RETURNING id",
    [`ubud-${randomUUID().slice(0, 8)}`],
  );
  crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id", [
    rin.uid,
  ]);
  await pool.query(
    `INSERT INTO crew_members (crew_id, user_id, role)
     VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [crewId, rin.uid, wes.uid, jordan.uid],
  );
  tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, tz)
     VALUES ($1, 'setup', $2, 'Asia/Makassar') RETURNING id`,
    [crewId, destinationId],
  );
  await pool.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
     VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in'), ($1, $4, 'member', 'in')`,
    [tripId, rin.uid, wes.uid, jordan.uid],
  );
  const poiId = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Karsa Spa', 'health', $2, $3) RETURNING id`,
    [destinationId, SPA.lat, SPA.lng],
  );
  const versionId = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const dayId = await one(
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
    [versionId, tripId],
  );
  itemId = await one(
    `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, ends_at, tz, category,
       attendee_ids, poi_id, created_by_kind)
     VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '90 minutes', 'Asia/Makassar',
       'activity', $5::uuid[], $6, 'guide') RETURNING id`,
    [versionId, dayId, tripId, STARTS_AT, [wes.uid, jordan.uid, rin.uid], poiId],
  );
  await pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
}, 240_000);

afterAll(async () => {
  await boss.stop({ graceful: false });
  await harness.stop();
});

describe('POST /v1/trips/{id}/journey-check', () => {
  it('refuses a stranger, a member not going and a second check inside half a minute', async () => {
    const point = readTrack()[0] as TrackPoint;
    expect(codeOf((await check(outsider, point)).body)).toBe('NOT_FOUND');
    await harness.pool.query('UPDATE plan_items SET attendee_ids = $2::uuid[] WHERE id = $1', [
      itemId,
      [wes.uid, rin.uid],
    ]);
    expect(codeOf((await check(jordan, point)).body)).toBe('NOT_ELIGIBLE');
    // Named on the item but no longer travelling: still refused.
    await harness.pool.query(
      "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
      [tripId, jordan.uid],
    );
    await harness.pool.query('UPDATE plan_items SET attendee_ids = $2::uuid[] WHERE id = $1', [
      itemId,
      [wes.uid, jordan.uid, rin.uid],
    ]);
    const left = await check(jordan, point);
    expect(left.body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    await harness.pool.query(
      "UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id = $2",
      [tripId, jordan.uid],
    );
    await harness.pool.query('UPDATE plan_items SET attendee_ids = $2::uuid[] WHERE id = $1', [
      itemId,
      [wes.uid, jordan.uid, rin.uid],
    ]);
    const anonymous = await harness.request(`/v1/trips/${tripId}/journey-check`, {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, lat: point.lat, lng: point.lng, mode: 'drive' }),
    });
    expect(anonymous.status).toBe(401);
    const first = await check(rin, point);
    expect(first.status).toBe(200);
    const again = await harness.request(`/v1/trips/${tripId}/journey-check`, {
      method: 'POST',
      headers: { cookie: rin.cookie },
      body: JSON.stringify({ item_id: itemId, lat: point.lat, lng: point.lng, mode: 'drive' }),
    });
    expect(again.status).toBe(429);
    await harness.pool.query('DELETE FROM journey_checks WHERE user_id = $1', [rin.uid]);
  });

  it('opens exactly one disruption over the whole drive, only after two late checks in a row', async () => {
    const seen: JourneyCheckResult[] = [];
    const opened: number[] = [];
    for (const point of readTrack()) {
      const answer = await check(wes, point);
      expect(answer.status).toBe(200);
      seen.push(journeyCheckResultSchema.parse(answer.body));
      opened.push((await lateDisruptions()).length);
    }
    expect(seen.map((s) => s.late_min)).toEqual([-2, -2, 3, 7, 11, 9, 12, 12, 13, 18, 20, 22, 24]);
    // Late once (11), back under the threshold (9): nothing. Late twice in a row (12, 12): open.
    expect(seen.map((s) => s.status)).toEqual([
      ...Array.from({ length: 7 }, () => 'on_time'),
      ...Array.from({ length: 6 }, () => 'late'),
    ]);
    expect(opened).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(seen[7]?.eta_at).toBe('2026-10-15T06:12:00.000Z');
    expect(seen.every((s) => s.estimate && !s.traffic)).toBe(true);

    const [late] = await lateDisruptions();
    expect(late).toMatchObject({
      status: 'open',
      cause: 'traffic',
      affected: { traveller_ids: [wes.uid], unaffected_ids: [jordan.uid, rin.uid].sort() },
      facts: { title: 'Karsa Spa', start: '14:00', eta: '14:24', late_min: 24, mode: 'drive' },
    });
    expect(seen.at(-1)?.disruption_id).toBe(late?.id);
    // The options are worked out when it opens, and again each time the lateness has moved five
    // minutes from what they were last worked out for (12, then 18, then 24).
    expect(await eventCount('running_late.detected')).toBe(3);
    const jobs = await all<{ data: { event_type: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'disruption.react' ORDER BY created_on LIMIT 1",
    );
    expect(jobs[0]?.data.event_type).toBe('running_late.detected');
  });

  it('keeps one check per member and item, and never where the car was', async () => {
    const checks = await all<{ row: string }>(
      'SELECT to_jsonb(c)::text AS row FROM journey_checks c WHERE trip_id = $1',
      [tripId],
    );
    expect(checks).toHaveLength(1);
    const kept = [
      ...checks.map((c) => c.row),
      ...(
        await all<{ row: string }>(
          'SELECT to_jsonb(d)::text AS row FROM disruptions d WHERE trip_id = $1',
          [tripId],
        )
      ).map((d) => d.row),
      ...(await all<{ row: string }>('SELECT payload::text AS row FROM rt_outbox')).map(
        (o) => o.row,
      ),
      ...(await all<{ row: string }>('SELECT data::text AS row FROM pgboss.job')).map((j) => j.row),
    ].join('\n');
    for (const point of readTrack()) expect(kept).not.toContain(String(point.lat));
    expect(kept).not.toContain('115.254');
  });
});

describe('choose_late_option', () => {
  it('lets only the late party pick, and only an option the planner offered', async () => {
    const [late] = await lateDisruptions();
    const id = late?.id as string;
    // The worker stores the planner's options; this suite runs no worker, so it stores them itself.
    const options = lateOptions({
      title: 'Karsa Spa',
      tz: 'Asia/Makassar',
      now: clock,
      startsAt: new Date(STARTS_AT),
      endsAt: new Date('2026-10-15T07:30:00Z'),
      etaAt: new Date('2026-10-15T06:24:00Z'),
      lateMin: 24,
      mode: 'drive',
      walkMin: null,
      latePartyIds: [wes.uid],
      waitingIds: [jordan.uid, rin.uid],
      nextStartsAt: null,
      vendorName: null,
      booking: {
        supplier: 'none',
        partner: null,
        priceMinor: null,
        currency: null,
        refundMinor: null,
        cancellable: null,
      },
      anchored: false,
      flight: false,
      rideable: true,
    });
    await harness.pool.query('UPDATE disruptions SET options = $2::jsonb WHERE id = $1', [
      id,
      JSON.stringify(options),
    ]);
    const pick = (who: SignedIn, option: string) =>
      run(who, 'choose_late_option', { disruption_id: id, option_id: option });
    expect(codeOf((await pick(outsider, 'push')).body)).toBe('NOT_FOUND');
    expect(codeOf((await pick(rin, 'push')).body)).toBe('NOT_ELIGIBLE');
    expect(codeOf((await pick(wes, 'walk')).body)).toBe('NOT_ELIGIBLE');
    expect(await chatLines()).toEqual([]);
  });

  it('tells the waiting crew at once, and corrects itself when the pick changes', async () => {
    const [late] = await lateDisruptions();
    const id = late?.id as string;
    const pushed = await run(wes, 'choose_late_option', { disruption_id: id, option_id: 'push' });
    expect(pushed.body['result']).toMatchObject({ chosen: true, option: 'push' });
    expect(await chatLines()).toEqual([
      { body: 'Wes is 24 min late for Karsa Spa. Start without waiting.' },
    ]);
    // The same pick again (a retried command, a second tap) says nothing twice.
    const again = await run(wes, 'choose_late_option', { disruption_id: id, option_id: 'push' });
    expect(again.body['result']).toMatchObject({ chosen: false, option: 'push' });
    expect(await chatLines()).toHaveLength(1);

    const skipped = await run(wes, 'choose_late_option', { disruption_id: id, option_id: 'skip' });
    expect(skipped.body['result']).toMatchObject({ chosen: true, option: 'skip' });
    expect((await chatLines()).at(-1)).toEqual({
      body: 'Update: Wes is skipping Karsa Spa. Go ahead.',
    });
    expect((await lateDisruptions())[0]?.chosen_option_id).toBe('skip');
    // One event per real change of mind: the repeated pick appended nothing.
    expect(await eventCount('late_option.chosen')).toBe(2);
  });

  it("says the arrival on the destination's clock when the trip has no zone of its own", async () => {
    // Most trips leave `trips.tz` empty and keep the destination's zone.
    await harness.pool.query('UPDATE trips SET tz = NULL WHERE id = $1', [tripId]);
    await harness.pool.query(
      `UPDATE destinations SET tz = 'Asia/Ho_Chi_Minh'
        WHERE id = (SELECT destination_id FROM trips WHERE id = $1)`,
      [tripId],
    );
    const [late] = await lateDisruptions();
    const id = late?.id as string;
    const { rows } = await harness.pool.query<{ options: { id: string }[] }>(
      'SELECT options FROM disruptions WHERE id = $1',
      [id],
    );
    // The routed walk gets there at 06:20 UTC: 13:20 in Đà Nẵng.
    const options = (rows[0]?.options ?? []).map((option) =>
      option.id === 'walk'
        ? { ...option, offered: true, arrive_at: '2026-10-15T06:20:00.000Z' }
        : option,
    );
    await harness.pool.query('UPDATE disruptions SET options = $2::jsonb WHERE id = $1', [
      id,
      JSON.stringify(options),
    ]);
    const walked = await run(wes, 'choose_late_option', { disruption_id: id, option_id: 'walk' });
    expect(walked.body['result']).toMatchObject({ chosen: true, option: 'walk' });
    expect((await chatLines()).at(-1)).toEqual({
      body: 'Update: Wes is walking the last bit to Karsa Spa, there about 13:20.',
    });
  });
});

describe('no longer late, and a late report without a journey', () => {
  it('takes the member out after two on-time checks and resolves an empty party', async () => {
    // The spa agreed to a later start: the same road is on time again.
    await harness.pool.query(
      "UPDATE plan_items SET starts_at = starts_at + interval '30 minutes' WHERE id = $1",
      [itemId],
    );
    const near = { lat: -8.504997, lng: 115.254 };
    const first = await check(wes, { ...near, at: new Date('2026-10-15T06:21:00Z') });
    expect(first.body).toMatchObject({ late_min: -5, status: 'late' });
    const second = await check(wes, { ...near, at: new Date('2026-10-15T06:22:00Z') });
    expect(second.body).toMatchObject({ late_min: -4, status: 'resolved', disruption_id: null });
    const [late] = await lateDisruptions();
    expect(late?.status).toBe('resolved');
    const third = await check(wes, { ...near, at: new Date('2026-10-15T06:23:00Z') });
    expect(third.body).toMatchObject({ status: 'on_time' });
  });

  it("opens the item's disruption from a member's own report, for that member", async () => {
    const reported = await run(jordan, 'report_running_late', {
      trip_id: tripId,
      item_id: itemId,
      minutes: 15,
    });
    expect(reported.status).toBe(200);
    const late = await lateDisruptions();
    expect(late).toHaveLength(2);
    expect(late[1]).toMatchObject({
      status: 'open',
      cause: 'manual',
      affected: { traveller_ids: [jordan.uid], unaffected_ids: [rin.uid, wes.uid].sort() },
      facts: { title: 'Karsa Spa', start: '14:30', eta: '14:45', late_min: 15 },
    });
    // A second report joins nothing new: still one open disruption for the item.
    await run(jordan, 'report_running_late', { trip_id: tripId, item_id: itemId, minutes: 20 });
    const after = await lateDisruptions();
    expect(after).toHaveLength(2);
    expect(after[1]?.facts['late_min']).toBe(20);
  });
});

describe('POST /v1/trips/{id}/journey-check to a transfer booked by hand', () => {
  const VILLA = { lat: -8.5069, lng: 115.2625 };
  let transferItemId: string;
  let bookingId: string;
  const point = () => ({ ...VILLA, lat: VILLA.lat + 0.03, at: new Date('2026-10-15T07:30:00Z') });

  beforeAll(async () => {
    const pool = harness.pool;
    bookingId = (
      await pool.query<{ id: string }>(
        `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, tz, location, source,
           visibility)
         VALUES ($1, $2, 'transfer', 'Airport run', '2026-10-15T08:00:00Z', 'Asia/Makassar',
           'Pickup at Villa Kayu Manis', 'manual', 'crew') RETURNING id`,
        [tripId, rin.uid],
      )
    ).rows[0]?.id as string;
    transferItemId = (
      await pool.query<{ id: string }>(
        `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, booking_id,
           notes, status, locked_reason, created_by_kind)
         SELECT version_id, day_id, trip_id, '2026-10-15T08:00:00Z', 'Asia/Makassar', 'transfer',
                $2, 'Airport run', 'confirmed', 'booking', 'user'
           FROM plan_items WHERE id = $1 RETURNING id`,
        [itemId, bookingId],
      )
    ).rows[0]?.id as string;
  });

  const setPickupPoint = (point: unknown) =>
    harness.pool.query(
      "UPDATE bookings SET details = jsonb_set(details, '{pickup_point}', $2::jsonb) WHERE id = $1",
      [bookingId, JSON.stringify(point)],
    );

  it('has no place to route to until its pickup is placed', async () => {
    const before = await check(wes, point(), transferItemId);
    expect(before.status).toBe(403);
    expect(before.body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    await setPickupPoint({ from_text: 'Pickup at Villa Kayu Manis', unresolved: true });
    expect((await check(wes, point(), transferItemId)).status).toBe(403);
  });

  it("routes to the booking's pickup point while it matches the pickup text", async () => {
    await setPickupPoint({
      from_text: 'Pickup at Villa Kayu Manis',
      ...VILLA,
      label: 'Villa Kayu Manis',
      source: 'poi',
    });
    const placed = await check(wes, point(), transferItemId);
    expect(placed.status).toBe(200);
    expect(placed.body).toMatchObject({ status: 'on_time' });
    // The traveller changed the pickup text: the old point no longer says where they are collected.
    await harness.pool.query("UPDATE bookings SET location = 'Hotel lobby' WHERE id = $1", [
      bookingId,
    ]);
    expect((await check(wes, point(), transferItemId)).status).toBe(403);
  });
});
