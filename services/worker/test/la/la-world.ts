/**
 * The Bali crew's trek leave-by an hour out, one iPhone per member, and the real APNs client
 * talking to the recorded fake APNs server. Broadcast channels come from an in-memory Channel
 * Management stand-in that hands out `apns-channel-id`s; the kill switches are the real reader
 * over `ops.ops_config`.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { createKillSwitchReader } from '@cp/db';
import { LA_QUEUES, type AppBundleId } from '@cp/domain';

import { LA_LOADERS, orchestrateObject, runLifecycle } from '../../src/jobs/la';
import type { LaDeps } from '../../src/jobs/la/orchestrate';
import { createApnsProvider, createCopyRenderer } from '../../src/push';
import type { ApnsEnv } from '../../src/push/apns';
import type { ApnsChannelManager } from '../../src/push/la-channels';
import { startFakeApns, type ApnsRequest, type FakeApns } from '../push-servers';
import { startTripDayWorld, type TripDayWorld } from '../trip-day/trip-day-world';

export const BUNDLE: AppBundleId = 'app.critterpass';

export interface FakeChannels extends ApnsChannelManager {
  readonly created: string[];
  readonly removed: string[];
}

export function fakeChannels(): FakeChannels {
  const created: string[] = [];
  const removed: string[] = [];
  return {
    created,
    removed,
    create(_env: ApnsEnv) {
      const channelId = Buffer.from(`channel-${created.length + 1}`).toString('base64');
      created.push(channelId);
      return Promise.resolve({ ok: true as const, channelId });
    },
    remove(_env, _bundle, channelId) {
      removed.push(channelId);
      return Promise.resolve(true);
    },
    shutdown: () => Promise.resolve(),
  };
}

export interface LaWorld {
  readonly trip: TripDayWorld;
  readonly apns: FakeApns;
  readonly channels: FakeChannels;
  readonly leaveById: string;
  /** One iPhone per member, same order as `trip.members`. */
  readonly devices: readonly string[];
  now: Date;
  q<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(): ReturnType<typeof orchestrateObject>;
  lifecycle(): ReturnType<typeof runLifecycle>;
  /** Requests the fake APNs saw since the last call. */
  drain(): ApnsRequest[];
  setSwitch(key: string, on: boolean): Promise<void>;
  stop(): Promise<void>;
}

export const isBroadcast = (r: ApnsRequest) => r.path.startsWith('/4/broadcasts/');
export const eventOf = (r: ApnsRequest) => (r.body['aps'] as { event?: string }).event;

export async function startLaWorld(): Promise<LaWorld> {
  const trip = await startTripDayWorld();
  for (const queue of Object.values(LA_QUEUES)) {
    if ((await trip.boss.getQueue(queue)) === null) {
      await trip.boss.createQueue(queue, { policy: 'standard' });
    }
  }
  const apns = await startFakeApns();
  const channels = fakeChannels();
  const provider = createApnsProvider({
    credentials: apns.credentials,
    addresses: apns.addresses,
    rejectUnauthorized: false,
  });
  const renderer = createCopyRenderer();
  const pool = trip.harness.pool;
  const world = { now: new Date(Math.floor(Date.now() / 60_000) * 60_000) };
  const leaveAt = new Date(world.now.getTime() + 60 * 60_000);

  const [leave] = await trip.q<{ id: string }>(
    `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, title, place_name,
       local_date, starts_at, leave_at, tz, legs, participant_ids, state)
     VALUES ($1, $2, $2, 'Batur sunrise', 'Mount Batur', $3, $4, $5, 'Asia/Makassar',
       '[{"minutes": 40, "source": "pickup"}]', $6, 'scheduled') RETURNING id`,
    [
      trip.tripId,
      trip.items.trek,
      leaveAt.toISOString().slice(0, 10),
      new Date(leaveAt.getTime() + 60 * 60_000),
      leaveAt,
      trip.members,
    ],
  );
  const leaveById = leave!.id;
  for (const user of trip.members) {
    await trip.q('INSERT INTO readiness (leave_by_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      leaveById,
      trip.tripId,
      user,
    ]);
  }
  const devices: string[] = [];
  for (const user of trip.members) {
    const id = randomUUID();
    devices.push(id);
    await trip.q(
      `INSERT INTO devices (id, user_id, platform, bundle_id, app_version, locale, tz, la_enabled,
         la_frequent)
       VALUES ($1, $2, 'ios', $3, '1.0.0', 'en', 'Asia/Makassar', true, true)`,
      [id, user, BUNDLE],
    );
    await trip.q(
      `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env)
       VALUES ($1, $2, 'leave_by', $3, 'sandbox')`,
      [id, user, randomBytes(32).toString('hex')],
    );
  }

  const deps = (): LaDeps => ({
    apns: provider,
    channels,
    loaders: LA_LOADERS,
    render: (locale, copy, vars) => renderer.render(locale, copy, vars),
    // A fresh reader per run, so a flip applies at once instead of after the cache window.
    switches: createKillSwitchReader(pool, { tierOf: () => 'standard' }),
    defaultBundleId: BUNDLE,
    now: () => world.now,
  });
  let seen = 0;

  return {
    trip,
    apns,
    channels,
    leaveById,
    devices,
    get now() {
      return world.now;
    },
    set now(at: Date) {
      world.now = at;
    },
    q: (sql, params) => trip.q(sql, params),
    run: async () => orchestrateObject(pool, deps(), 'leave_by', leaveById),
    lifecycle: async () => runLifecycle(pool, deps(), world.now),
    drain() {
      const fresh = apns.requests.slice(seen);
      seen = apns.requests.length;
      return fresh;
    },
    async setSwitch(key, on) {
      await trip.q(
        `INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(on)],
      );
    },
    async stop() {
      await provider.shutdown();
      await apns.close();
      await trip.stop();
    },
  };
}
