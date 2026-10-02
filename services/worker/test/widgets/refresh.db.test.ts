/**
 * The widget refresh pipeline against a migrated Postgres, pg-boss and the recorded fake APNs
 * server: a burst of routine events reaches each install as one push plus one held trailing push,
 * a vote closing always pushes, the daily cap stops routine pushes only, an install without a
 * widget is never pushed, and the kill switch stops everything.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import {
  appendDomainEvent,
  createKillSwitchReader,
  onEventAppended,
  resetEventAppendedHooksForTests,
  withSystem,
} from '@cp/db';
import { WIDGET_DAILY_CAP, WIDGET_QUEUES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadTarget,
  pushToDevice,
  refreshWidgets,
  widgetEventHook,
  type WidgetPushDeps,
} from '../../src/jobs/widgets';
import { createApnsProvider, type ApnsProvider } from '../../src/push';
import { startFakeApns, type ApnsRequest, type FakeApns } from '../push-servers';
import { startTripDayWorld, type TripDayWorld } from '../trip-day/trip-day-world';

const BUNDLE = 'app.critterpass';
let world: TripDayWorld;
let apns: FakeApns;
let provider: ApnsProvider;
let now = new Date('2026-10-14T08:00:00Z');
let seen = 0;
/** Maya and Dev show a widget; Rin has a token but no widget. */
const phones: string[] = [];
const tokens: string[] = [];

const deps = (): WidgetPushDeps => ({
  apns: provider,
  // A fresh reader per run, so a flip applies at once instead of after the cache window.
  switches: createKillSwitchReader(world.harness.pool, { tierOf: () => 'standard' }),
  defaultBundleId: BUNDLE,
  now: () => now,
});

function drain(): ApnsRequest[] {
  const fresh = apns.requests.slice(seen);
  seen = apns.requests.length;
  return fresh;
}

const tick = (minutes: number) => {
  now = new Date(now.getTime() + minutes * 60_000);
};

async function event(type: 'packing.checked' | 'poll.closed'): Promise<string> {
  const payload =
    type === 'packing.checked'
      ? { trip_id: world.tripId, item_id: randomUUID(), user_id: world.members[1], checked: true }
      : {
          poll_id: randomUUID(),
          crew_id: world.crewId,
          trip_id: world.tripId,
          kind: 'generic',
          winner_option_id: null,
          reason: 'deadline',
          tie_broken: false,
        };
  const appended = await withSystem(world.harness.pool, (tx) =>
    appendDomainEvent(tx, {
      type,
      aggregateKind: 'trip',
      aggregateId: world.tripId,
      actorKind: 'system',
      actorId: null,
      crewId: world.crewId,
      tripId: world.tripId,
      payload,
    }),
  );
  return appended.id;
}

const heldPushes = async () =>
  (
    await world.q<{ n: number }>(
      `SELECT count(*)::int AS n FROM pgboss.job
        WHERE name = $1 AND state = 'created' AND start_after > now()`,
      [WIDGET_QUEUES.push],
    )
  )[0]!.n;

const setSwitch = (on: boolean) =>
  world.q(
    `INSERT INTO ops.ops_config (key, value) VALUES ('widgets.push.enabled', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );

beforeAll(async () => {
  world = await startTripDayWorld();
  for (const queue of Object.values(WIDGET_QUEUES)) {
    if ((await world.boss.getQueue(queue)) === null) {
      await world.boss.createQueue(queue, { policy: 'exclusive' });
    }
  }
  apns = await startFakeApns();
  provider = createApnsProvider({
    credentials: apns.credentials,
    addresses: apns.addresses,
    rejectUnauthorized: false,
  });
  for (const [index, user] of world.members.slice(0, 3).entries()) {
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    phones.push(id);
    tokens.push(token);
    await world.q(
      `INSERT INTO devices (id, user_id, platform, bundle_id, app_version, locale, tz)
       VALUES ($1, $2, 'ios', $3, '1.0.0', 'en', 'Asia/Makassar')`,
      [id, user, BUNDLE],
    );
    await world.q(
      `INSERT INTO widget_push_tokens (device_id, user_id, token, env)
       VALUES ($1, $2, $3, 'sandbox')`,
      [id, user, token],
    );
    if (index !== 1) {
      await world.q(
        `INSERT INTO installed_widgets (device_id, user_id, kind, family)
         VALUES ($1, $2, 'today', 'system_large')`,
        [id, user],
      );
    }
  }
}, 240_000);

afterAll(async () => {
  resetEventAppendedHooksForTests();
  await provider?.shutdown();
  await apns?.close();
  await world?.stop();
});

describe('widget refresh', { timeout: 120_000 }, () => {
  it('queues one refresh for an event a widget shows, in the event’s transaction', async () => {
    onEventAppended(widgetEventHook);
    const id = await event('packing.checked');
    resetEventAppendedHooksForTests();
    const jobs = await world.q<{ data: { event_id: string } }>(
      'SELECT data FROM pgboss.job WHERE name = $1',
      [WIDGET_QUEUES.refresh],
    );
    expect(jobs.map((job) => job.data.event_id)).toEqual([id]);
  });

  it('sends nothing while the switch is off', async () => {
    await setSwitch(false);
    const result = await refreshWidgets(world.harness.pool, deps(), await event('poll.closed'));
    expect(result.outcome).toBe('switched_off');
    expect(drain()).toEqual([]);
    await setSwitch(true);
  });

  it('folds 50 routine events in 10 minutes into one push per install, and holds one more', async () => {
    for (let i = 0; i < 50; i += 1) {
      await refreshWidgets(world.harness.pool, deps(), await event('packing.checked'));
      tick(0.2);
    }
    const sent = drain();
    expect(sent).toHaveLength(2);
    for (const request of sent) {
      expect(request.headers['apns-push-type']).toBe('widgets');
      expect(request.headers['apns-topic']).toBe(`${BUNDLE}.push-type.widgets`);
      expect(request.body).toEqual({ aps: { 'content-changed': true } });
    }
    // Maya's and Dev's phones; Rin shows no widget and is never pushed.
    expect(sent.map((request) => request.path.split('/').pop()).sort()).toEqual(
      [tokens[0], tokens[2]].sort(),
    );
    expect(await heldPushes()).toBe(2);
  });

  it('sends the held push once the window has ended', async () => {
    tick(6);
    const target = await loadTarget(world.harness.pool, phones[0]!);
    expect(await pushToDevice(world.harness.pool, deps(), target!, false)).toBe('sent');
    expect(drain()).toHaveLength(1);
  });

  it('always pushes a vote closing, inside the window', async () => {
    const result = await refreshWidgets(world.harness.pool, deps(), await event('poll.closed'));
    expect(result).toEqual({ outcome: 'done', devices: { sent: 2 } });
    expect(drain()).toHaveLength(2);
  });

  it('stops routine pushes at the daily cap and still pushes a vote closing', async () => {
    tick(60);
    await world.q('UPDATE widget_push_ledger SET sent = $1', [WIDGET_DAILY_CAP]);
    await world.q(
      `INSERT INTO widget_push_ledger (device_id, utc_date, sent)
       SELECT id, $2::date, $1 FROM devices WHERE id = ANY ($3::uuid[])
       ON CONFLICT (device_id, utc_date) DO UPDATE SET sent = EXCLUDED.sent`,
      [WIDGET_DAILY_CAP, now.toISOString().slice(0, 10), phones],
    );
    const routine = await refreshWidgets(
      world.harness.pool,
      deps(),
      await event('packing.checked'),
    );
    expect(routine.devices).toEqual({ capped: 2 });
    expect(drain()).toEqual([]);
    const close = await refreshWidgets(world.harness.pool, deps(), await event('poll.closed'));
    expect(close.devices).toEqual({ sent: 2 });
    expect(drain()).toHaveLength(2);
  });
});
