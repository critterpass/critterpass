/**
 * `trip_locations:{trip_id}` through the real subscribe proxy: a participant may subscribe while
 * the crew map is open whether or not they share; the gate closed (unboosted, or past last-day
 * midnight) denies them; crew members off the trip and outsiders are always denied.
 */
import { withSystem } from '@cp/db';
import { crewMapChannel } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RtRateStore } from '../../src/realtime/publish-rules';
import { registerInternalRtRoutes, RT_PROXY_SECRET_HEADER } from '../../src/routes/internal-rt';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import {
  buildLiveMapFixture,
  localDate,
  setBoost,
  TRIP_TZ,
  type LiveMapFixture,
} from './live-map-fixture';

const SECRET = 'test-rt-proxy-secret-0123456789abcdef';
let harness: CommandDoorsHarness;
let fx: LiveMapFixture;
let unboosted: LiveMapFixture;
let ended: LiveMapFixture;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) =>
      registerInternalRtRoutes(app, {
        pool: deps.pool,
        // The harness's full Redis client; the doors only type the rate-limit subset.
        redis: deps.redis as unknown as RtRateStore,
        proxySecret: SECRET,
      }),
  );
  fx = await buildLiveMapFixture(harness);
  unboosted = await buildLiveMapFixture(harness);
  ended = await buildLiveMapFixture(harness);
  await setBoost(harness.pool, fx.tripId, true);
  await setBoost(harness.pool, unboosted.tripId, false);
  await setBoost(harness.pool, ended.tripId, true);
  // Still marked in trip, but the last day was yesterday: the window closed at midnight.
  await withSystem(harness.pool, (tx) =>
    tx.query('UPDATE trips SET start_date = $2, end_date = $3 WHERE id = $1', [
      ended.tripId,
      localDate(TRIP_TZ, -3),
      localDate(TRIP_TZ, -1),
    ]),
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function subscribe(uid: string, tripId: string): Promise<boolean> {
  const response = await harness.request('/internal/rt/subscribe', {
    method: 'POST',
    headers: { [RT_PROXY_SECRET_HEADER]: SECRET },
    body: JSON.stringify({
      client: 'c',
      transport: 'websocket',
      user: uid,
      channel: crewMapChannel(tripId),
    }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result?: unknown; error?: { code: number } };
  return body.result !== undefined;
}

describe('trip_locations subscribe ACL', () => {
  it('allows a participant who is not sharing while the map is open', async () => {
    expect(await subscribe(fx.rin.uid, fx.tripId)).toBe(true);
    expect(await subscribe(fx.maya.uid, fx.tripId)).toBe(true);
  });

  it('denies a participant when the trip is not boosted', async () => {
    expect(await subscribe(unboosted.maya.uid, unboosted.tripId)).toBe(false);
  });

  it('denies a participant after the window has closed', async () => {
    expect(await subscribe(ended.maya.uid, ended.tripId)).toBe(false);
  });

  it('denies a crew member off the trip and an outsider', async () => {
    expect(await subscribe(fx.bystander.uid, fx.tripId)).toBe(false);
    expect(await subscribe(fx.outsider.uid, fx.tripId)).toBe(false);
  });

  it('denies a participant who answered out', async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
        fx.tripId,
        fx.rin.uid,
      ]),
    );
    expect(await subscribe(fx.rin.uid, fx.tripId)).toBe(false);
  });
});
