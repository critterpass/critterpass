/**
 * Widgets against a migrated Postgres, through the real doors: the extension's token and the
 * installed list are stored for the caller's own install only; the snapshot is the viewer's own
 * (their net, never a crewmate's budget or anyone's coordinates), drops the next flight and marks
 * it locked without Pass+, answers 304 on an unchanged ETag, and opens to a device action key only
 * with the `read_snapshot` scope. Today carries the viewer's own plan rows, packing and the
 * forecast; Balances names who to nudge by first name only, and when; Crew dots carry initials.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7, widgetSnapshotSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerWidgetCommands } from '../../src/commands/widgets';
import {
  signedHeaders,
  startActionDoors,
  type ActionDoorsHarness,
  type SignedIn,
} from '../routes/action-doors-harness';
import { envelope } from '../routes/command-doors-harness';

let harness: ActionDoorsHarness;
let maya: SignedIn;
let rin: SignedIn;
let tripId: string;
let otherTripId: string;
const mayaPhone = randomUUID();
const rinPhone = randomUUID();

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function run(who: SignedIn, cmd: string, payload: unknown, deviceId: string) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, {
        op_id: generateUuidV7(),
        actor: { uid: who.uid, via: 'app' },
        device: { id: deviceId, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
      }),
    ),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function issueKey(who: SignedIn, deviceId: string, scopes: string[]) {
  const response = await harness.request(`/v1/devices/${deviceId}/action-keys`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ scopes }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { key_id: string; secret: string };
}

const snapshot = (who: SignedIn, headers: Record<string, string> = {}, query = '') =>
  harness.request(`/v1/widgets/snapshot${query}`, { headers: { cookie: who.cookie, ...headers } });

beforeAll(async () => {
  harness = await startActionDoors();
  registerWidgetCommands(harness.registry);
  [maya, rin] = await Promise.all([harness.signInAnonymously(), harness.signInAnonymously()]);
  for (const [who, device] of [
    [maya, mayaPhone],
    [rin, rinPhone],
  ] as const) {
    const registered = await run(
      who,
      'register_device',
      { platform: 'ios', tz: 'Asia/Ho_Chi_Minh', locale: 'en', app_version: '1.0.0' },
      device,
    );
    expect(registered.status).toBe(200);
  }
  ({ tripId, otherTripId } = await withSystem(harness.pool, async (tx) => {
    const one = async (sql: string, params: unknown[]) =>
      (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
    const crew = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Da Nang', $1) RETURNING id",
      [maya.uid],
    );
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [crew, maya.uid, rin.uid],
    );
    const trip = await one(
      `INSERT INTO trips (crew_id, status, start_date, end_date, tz)
       VALUES ($1, 'voting', current_date + 3, current_date + 6, 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [crew],
    );
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp, countdown_target_at)
       VALUES ($1, $2, 'organiser', 'in', now() + interval '3 days'),
              ($1, $3, 'member', 'in', now() + interval '3 days')`,
      [trip, maya.uid, rin.uid],
    );
    // Rin owes Maya 250 000 VND.
    await tx.query(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
         currency, source_kind, source_id)
       VALUES ($1, $2, $3, $4, 250000, 'VND', 'expense', gen_random_uuid())`,
      [crew, trip, rin.uid, maya.uid],
    );
    const booking = await one(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
       VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
      [trip, maya.uid, [maya.uid]],
    );
    await tx.query(
      `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier,
         flight_no, dep_airport, arr_airport, sched_dep_at)
       VALUES ($1, $2, $3, true, 'VJ', '631', 'SGN', 'DAD', now() + interval '3 days')`,
      [booking, trip, maya.uid],
    );
    // A crew neither of them belongs to.
    const stranger = (await harness.signInAnonymously()).uid;
    const otherCrew = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Hue', $1) RETURNING id",
      [stranger],
    );
    const other = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [otherCrew],
    );
    return { tripId: trip, otherTripId: other };
  }));
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('register_widget_token', () => {
  it('keeps one token per install, the newest, and refuses someone else’s install', async () => {
    const first = await run(maya, 'register_widget_token', { token: 'A'.repeat(64) }, mayaPhone);
    expect(first.status).toBe(200);
    await run(maya, 'register_widget_token', { token: 'b'.repeat(64) }, mayaPhone);
    expect(
      await q('SELECT widget_kind, token, env FROM widget_push_tokens WHERE device_id = $1', [
        mayaPhone,
      ]),
    ).toEqual([{ widget_kind: 'all', token: 'b'.repeat(64), env: 'prod' }]);
    const foreign = await run(rin, 'register_widget_token', { token: 'c'.repeat(64) }, mayaPhone);
    expect(foreign.status).toBe(403);
  });
});

describe('sync_installed_widgets', () => {
  it('replaces the install’s list with what the phone shows now', async () => {
    const widgets = [
      { kind: 'countdown', family: 'system_small', trip_id: tripId },
      { kind: 'vote', family: 'system_medium' },
    ];
    expect((await run(maya, 'sync_installed_widgets', { widgets }, mayaPhone)).status).toBe(200);
    await run(
      maya,
      'sync_installed_widgets',
      { widgets: [{ kind: 'today', family: 'system_large' }] },
      mayaPhone,
    );
    expect(
      await q('SELECT kind, family, config FROM installed_widgets WHERE device_id = $1', [
        mayaPhone,
      ]),
    ).toEqual([{ kind: 'today', family: 'system_large', config: {} }]);
  });

  it('refuses a widget set to a trip the caller cannot see', async () => {
    const response = await run(
      maya,
      'sync_installed_widgets',
      { widgets: [{ kind: 'countdown', family: 'system_small', trip_id: otherTripId }] },
      mayaPhone,
    );
    expect(response.status).toBe(403);
  });
});

describe('GET /v1/widgets/snapshot', () => {
  it('needs a session or a key', async () => {
    expect((await harness.request('/v1/widgets/snapshot')).status).toBe(401);
  });

  it('omits the next flight and marks it locked without Pass+, and carries it with Pass+', async () => {
    const free = widgetSnapshotSchema.parse(await (await snapshot(maya)).json());
    expect(free.trip?.id).toBe(tripId);
    expect(free.countdown).not.toBeNull();
    expect(free.next_flight).toBeNull();
    expect(free.crew).toBeNull();
    expect(free.locked).toEqual(['crew', 'next_flight']);

    await q(
      `INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
      [maya.uid],
    );
    const plus = widgetSnapshotSchema.parse(await (await snapshot(maya)).json());
    expect(plus.next_flight).toMatchObject({
      carrier: 'VJ',
      dep_airport: 'SGN',
      arr_airport: 'DAD',
    });
    expect(plus.locked).toEqual(['crew']);
    // Rin has no flight and no Pass+: Maya's flight is never hers to see.
    const rins = widgetSnapshotSchema.parse(await (await snapshot(rin)).json());
    expect(rins.next_flight).toBeNull();
  });

  it('shows each viewer their own net and no coordinates or budgets', async () => {
    const mine = await (await snapshot(maya)).text();
    const hers = await (await snapshot(rin)).text();
    expect(JSON.parse(mine)).toMatchObject({ balances: { currency: 'VND', net_minor: 250_000 } });
    expect(JSON.parse(hers)).toMatchObject({ balances: { currency: 'VND', net_minor: -250_000 } });
    for (const body of [mine, hers]) expect(body).not.toMatch(/"(lat|lng|budget[a-z_]*)"/);
  });

  it('answers 304 while nothing a widget shows has changed', async () => {
    const first = await snapshot(rin);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^".+"$/);
    expect((await snapshot(rin, { 'if-none-match': etag! })).status).toBe(304);
    await q(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
         currency, source_kind, source_id)
       SELECT crew_id, id, $2, $3, 1000, 'VND', 'expense', gen_random_uuid() FROM trips WHERE id = $1`,
      [tripId, rin.uid, maya.uid],
    );
    expect((await snapshot(rin, { 'if-none-match': etag! })).status).toBe(200);
  });

  it('refuses a trip the caller is not on', async () => {
    expect((await snapshot(maya, {}, `?trip_id=${otherTripId}`)).status).toBe(404);
  });

  it('opens to an action key with read_snapshot and to no other key', async () => {
    const path = '/v1/widgets/snapshot';
    const reader = await issueKey(rin, rinPhone, ['read_snapshot']);
    const ok = await harness.request(path, { headers: signedHeaders(reader, 'GET', path, '') });
    expect(ok.status).toBe(200);
    expect(widgetSnapshotSchema.parse(await ok.json()).trip?.id).toBe(tripId);

    const voter = await issueKey(maya, mayaPhone, ['ballot']);
    const refused = await harness.request(path, {
      headers: signedHeaders(voter, 'GET', path, ''),
    });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: 'ACTION_KEY_SCOPE' } });
  });
});

describe('the snapshot fields the widgets draw', () => {
  const day = (offsetMinutes: number) =>
    // Noon today in the trip's zone, plus an offset: always inside the local day.
    q<{ at: Date }>(
      `SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + time '12:00')
                AT TIME ZONE 'Asia/Ho_Chi_Minh' + make_interval(mins => $1) AS at`,
      [offsetMinutes],
    ).then((rows) => rows[0]!.at);

  beforeAll(async () => {
    await q("UPDATE users SET display_name = 'Maya Tan' WHERE id = $1", [maya.uid]);
    await q("UPDATE users SET display_name = 'Rin Sato' WHERE id = $1", [rin.uid]);
    await withSystem(harness.pool, async (tx) => {
      const one = async (sql: string, params: unknown[]) =>
        (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
      const destination = await one(
        `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
         VALUES ($1, 'Da Nang', 'VN', 'live', 'VND', 'Asia/Ho_Chi_Minh') RETURNING id`,
        [`da-nang-${randomUUID().slice(0, 8)}`],
      );
      await tx.query('UPDATE trips SET destination_id = $2 WHERE id = $1', [tripId, destination]);
      const version = await one(
        `INSERT INTO itinerary_versions (trip_id, visibility, status)
         VALUES ($1, 'crew', 'current') RETURNING id`,
        [tripId],
      );
      await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, version]);
      const planDay = await one(
        'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
        [version, tripId],
      );
      const items: [number, string, string[]][] = [
        [-180, 'Morning swim', []],
        [0, 'Banh mi lunch', [maya.uid, rin.uid]],
        [120, 'Rin alone at the spa', [rin.uid]],
      ];
      for (const [offset, notes, attendees] of items) {
        await tx.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, notes,
             attendee_ids)
           VALUES ($1, $2, $3, $4, 'Asia/Ho_Chi_Minh', 'activity', $5, $6::uuid[])`,
          [version, planDay, tripId, await day(offset), notes, attendees],
        );
      }
      const today = (
        await tx.query<{ d: string }>(
          "SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS d",
        )
      ).rows[0]!.d;
      await tx.query(
        `INSERT INTO packing_items (trip_id, day, owner_id, label, checked, checked_at) VALUES
           ($1, $2, $3, 'Sunscreen', false, NULL), ($1, NULL, NULL, 'Snorkels', true, now()),
           ($1, $2, $4, 'Rin''s hat', false, NULL)`,
        [tripId, today, maya.uid, rin.uid],
      );
      const hours = [0, 6, 18].map((h) => ({
        at: new Date(Date.now() + h * 3_600_000).toISOString(),
        temp_c: h === 6 ? 33.4 : 28,
        chance_of_rain: h === 18 ? 80 : 10,
        precip_mm: 0,
        wind_kph: 5,
        gust_kph: 9,
        uv: 4,
        code: 1000,
        is_day: true,
      }));
      await tx.query(
        `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, date, hourly, source,
           fetched_at, checked_at)
         VALUES ($1, 'centre', 16.05, 108.2, $2::date, $3::jsonb, 'weatherapi', now(), now())`,
        [
          destination,
          today,
          JSON.stringify({
            day: {
              max_temp_c: 33,
              min_temp_c: 25,
              chance_of_rain: 80,
              precip_mm: 2,
              uv: 6,
              code: 1063,
            },
            hours,
          }),
        ],
      );
    });
  });

  it('gives each viewer their own plan rows and packing, and the forecast', async () => {
    const mine = widgetSnapshotSchema.parse(await (await snapshot(maya)).json());
    expect(mine.today?.plan.map((row) => row.title)).toEqual(['Morning swim', 'Banh mi lunch']);
    expect(mine.today?.packing).toEqual([
      expect.objectContaining({ label: 'Sunscreen', checked: false }),
      expect.objectContaining({ label: 'Snorkels', checked: true }),
    ]);
    expect(mine.today?.forecast).toMatchObject({ temp_max_c: 33, condition: 'rain' });
    expect(mine.today?.forecast?.rain_from).not.toBeNull();
    const hers = widgetSnapshotSchema.parse(await (await snapshot(rin)).json());
    expect(hers.today?.plan.map((row) => row.title)).toEqual([
      'Morning swim',
      'Banh mi lunch',
      'Rin alone at the spa',
    ]);
    expect(hers.today?.packing.map((item) => item.label)).toEqual(["Rin's hat", 'Snorkels']);
  });

  it('names who to nudge by first name, only to the one who is owed, and says when', async () => {
    const mine = widgetSnapshotSchema.parse(await (await snapshot(maya)).json());
    expect(mine.balances?.nudge).toEqual({
      user_id: rin.uid,
      first_name: 'Rin',
      available_at: null,
    });
    const hers = widgetSnapshotSchema.parse(await (await snapshot(rin)).json());
    expect(hers.balances?.nudge).toBeNull();
    const body = await (await snapshot(maya)).text();
    expect(body).not.toContain('Sato');

    await q(
      `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, channel)
       SELECT $1, $2, crew_id, id, 'payment', 'inbox' FROM trips WHERE id = $3`,
      [maya.uid, rin.uid, tripId],
    );
    const later = widgetSnapshotSchema.parse(await (await snapshot(maya)).json());
    const next = Date.parse(later.balances?.nudge?.available_at ?? '');
    expect(next - Date.now()).toBeGreaterThan(23 * 3_600_000);
  });

  it('gives crew dots an initial, never a name', async () => {
    await q(
      `INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, true)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = true`,
      [tripId],
    );
    await q(
      `INSERT INTO member_etas (trip_id, user_id, eta_min, sharing)
       VALUES ($1, $2, 8, 'live') ON CONFLICT (trip_id, user_id) DO UPDATE SET eta_min = 8`,
      [tripId, rin.uid],
    );
    const body = await (await snapshot(maya)).text();
    const crew = widgetSnapshotSchema.parse(JSON.parse(body)).crew;
    expect(crew?.members).toEqual([{ user_id: rin.uid, bucket: 'close', initial: 'R' }]);
    expect(body).not.toMatch(/Rin Sato/);
  });
});
