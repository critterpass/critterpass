/**
 * `GET /v1/trips/{id}/live-snapshot`: what a (re)connecting viewer loads. Every sharing member's
 * latest fix, never a paused member's; every open share with its pause state; the meet-up and its
 * ETAs. Same gate as the channel.
 */
import { withSystem } from '@cp/db';
import { liveSnapshotSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerLiveMapRoutes } from '../../src/routes/live-map';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import type { SignedIn } from '../routes/command-doors-harness';
import { buildLiveMapFixture, setBoost, type LiveMapFixture } from './live-map-fixture';

let harness: CommandDoorsHarness;
let fx: LiveMapFixture;
let unboosted: LiveMapFixture;
let meetupId: string;

async function openShareWithFix(
  uid: string,
  tripId: string,
  fix: { lat: number; lng: number; secondsAgo: number },
  paused = false,
): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at, paused)
       VALUES ($1, $2, 'crew_map', now() - interval '10 minutes', app.crew_map_window_end($1), $3)
       RETURNING id`,
      [tripId, uid, paused],
    );
    const shareId = rows[0]!.id;
    await tx.query(
      `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, activity, at)
       VALUES ($1, $2, $3, $4, $5, 8, 'walking', now() - make_interval(secs => $6)),
              ($1, $2, $3, 0, 0, 8, 'walking', now() - interval '9 minutes')`,
      [uid, tripId, shareId, fix.lat, fix.lng, fix.secondsAgo],
    );
    return shareId;
  });
}

function snapshot(who: SignedIn, tripId: string): Promise<Response> {
  return harness.request(`/v1/trips/${tripId}/live-snapshot`, {
    headers: { cookie: who.cookie },
  });
}

beforeAll(async () => {
  harness = await startCommandDoors(() => undefined, registerLiveMapRoutes);
  fx = await buildLiveMapFixture(harness);
  unboosted = await buildLiveMapFixture(harness);
  await setBoost(harness.pool, fx.tripId, true);
  await setBoost(harness.pool, unboosted.tripId, false);
  await openShareWithFix(fx.maya.uid, fx.tripId, { lat: -8.5069, lng: 115.2625, secondsAgo: 20 });
  await openShareWithFix(fx.rin.uid, fx.tripId, { lat: -8.51, lng: 115.27, secondsAgo: 10 }, true);
  meetupId = await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO meetups (trip_id, poi_id, place_name, lat, lng, meet_at, created_by, arrived)
       VALUES ($1, $2, 'Campuhan Ridge', -8.5031, 115.2544, now() + interval '1 hour', $3,
               jsonb_build_object($4::text, now()))
       RETURNING id`,
      [fx.tripId, fx.poiId, fx.maya.uid, fx.maya.uid],
    );
    const id = rows[0]!.id;
    await tx.query(
      `INSERT INTO member_etas (trip_id, meetup_id, user_id, eta_min, distance_m, mode, estimate,
                                status_text, sharing)
       VALUES ($1, $2, $3, 4, 420, 'pedestrian', true, 'leaving_place:Karsa Spa', 'live')`,
      [fx.tripId, id, fx.maya.uid],
    );
    return id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('GET /v1/trips/{id}/live-snapshot', () => {
  it('returns sharing members’ latest fixes, never a paused one', async () => {
    const response = await snapshot(fx.rin, fx.tripId);
    expect(response.status).toBe(200);
    const body = liveSnapshotSchema.parse(await response.json());
    expect(body.members).toEqual([
      expect.objectContaining({
        uid: fx.maya.uid,
        lat: -8.5069,
        lng: 115.2625,
        activity: 'walking',
      }),
    ]);
    expect(body.shares.map((s) => [s.uid, s.paused]).sort()).toEqual(
      [
        [fx.maya.uid, false],
        [fx.rin.uid, true],
      ].sort(),
    );
    expect(body.meetup?.id).toBe(meetupId);
    expect(body.etas).toEqual([
      {
        uid: fx.maya.uid,
        min: 4,
        distance_m: 420,
        mode: 'pedestrian',
        estimate: true,
        status: { key: 'leaving_place', poi: 'Karsa Spa', distance_m: 420 },
        arrived: true,
      },
    ]);
    expect(body.window_ends_at).not.toBeNull();
  });

  it('answers ENTITLEMENT_REQUIRED on an unboosted trip', async () => {
    const response = await snapshot(unboosted.maya, unboosted.tripId);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('refuses a crew member off the trip and an outsider', async () => {
    expect((await snapshot(fx.bystander, fx.tripId)).status).toBe(403);
    expect((await snapshot(fx.outsider, fx.tripId)).status).toBe(403);
  });

  it('needs a session', async () => {
    expect((await harness.request(`/v1/trips/${fx.tripId}/live-snapshot`)).status).toBe(401);
  });
});
