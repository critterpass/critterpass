/**
 * `POST /v1/loc` against a migrated Postgres and Redis: fixes land only in the caller's own open
 * share, share and SOS fixes are never rejected for anti-spoof flags, SOS skips the 5 s rate limit,
 * and every accepted batch is published to the crew channel (and the SOS channel for SOS). The
 * publisher is a recording stand-in at the Centrifugo network boundary.
 */
import { withSystem } from '@cp/db';
import { MOCK_FLAG_IMPLAUSIBLE, MOCK_FLAG_SIMULATED, type LocationFix } from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { flagBatch, registerLocationRoute } from '../../src/routes/loc';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { buildLocationFixture, type LocationFixture } from './location-fixture';

let harness: CommandDoorsHarness;
let fx: LocationFixture;
const published: { channel: string; data: { data: { fixes: { mock: number }[] } } }[] = [];

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) =>
      registerLocationRoute(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        publish: (channel, data) => {
          published.push({ channel, data: data as (typeof published)[number]['data'] });
          return Promise.resolve();
        },
      }),
  );
  fx = await buildLocationFixture(harness);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

beforeEach(async () => {
  published.length = 0;
  await harness.redis.flushAll();
});

async function openShare(
  userId: string,
  reason: 'crew_map' | 'help' | 'sos',
  endsAt: string | null = null,
): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
       VALUES ($1, $2, $3, now() - interval '1 minute', $4) RETURNING id`,
      [fx.tripId, userId, reason, endsAt],
    );
    return rows[0]!.id;
  });
}

const fixAt = (secondsAgo: number, mock = 0) => ({
  lat: -8.5069,
  lng: 115.2625,
  acc: 8,
  at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
  mock,
});

function post(session: SignedIn, shareId: string, fixes: unknown[]): Promise<Response> {
  return harness.request('/v1/loc', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ share_id: shareId, fixes }),
  });
}

async function storedFlags(shareId: string): Promise<number[]> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ mock_flags: number }>(
      'SELECT mock_flags FROM location_fixes WHERE share_id = $1 ORDER BY at',
      [shareId],
    );
    return rows.map((row) => row.mock_flags);
  });
}

describe('POST /v1/loc', () => {
  it('stores a Help fix and publishes it to the crew channel', async () => {
    const share = await openShare(fx.traveller.uid, 'help');
    const response = await post(fx.traveller, share, [fixAt(2)]);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(published.map((p) => p.channel)).toEqual([`trip_locations:${fx.tripId}`]);
  });

  it('accepts a software-simulated fix on an SOS share, flag stored, on both channels', async () => {
    const sos = await openShare(fx.traveller.uid, 'sos');
    const response = await post(fx.traveller, sos, [fixAt(1, MOCK_FLAG_SIMULATED)]);
    expect(response.status).toBe(202);
    expect(await storedFlags(sos)).toEqual([MOCK_FLAG_SIMULATED]);
    expect(published.map((p) => p.channel).sort()).toEqual(
      [`sos:${sos}`, `trip_locations:${fx.tripId}`].sort(),
    );
    expect(published[0]!.data.data.fixes[0]!.mock).toBe(MOCK_FLAG_SIMULATED);
  });

  it('answers 403 for an ended share and for someone else’s share', async () => {
    const ended = await openShare(
      fx.traveller.uid,
      'help',
      new Date(Date.now() - 1000).toISOString(),
    );
    expect((await post(fx.traveller, ended, [fixAt(1)])).status).toBe(403);
    const theirs = await openShare(fx.crewmate.uid, 'help');
    expect((await post(fx.traveller, theirs, [fixAt(1)])).status).toBe(403);
    expect(published).toEqual([]);
  });

  it('limits a user to one batch per 5 s, except on SOS', async () => {
    const help = await openShare(fx.crewmate.uid, 'help');
    expect((await post(fx.crewmate, help, [fixAt(2)])).status).toBe(202);
    const second = await post(fx.crewmate, help, [fixAt(1)]);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    const sos = await openShare(fx.crewmate.uid, 'sos');
    expect((await post(fx.crewmate, sos, [fixAt(1)])).status).toBe(202);
    expect((await post(fx.crewmate, sos, [fixAt(0)])).status).toBe(202);
  });

  it('flags an implausible jump inside a batch but still stores it', async () => {
    const share = await openShare(fx.traveller.uid, 'crew_map');
    const jump = { ...fixAt(1), lat: -7.5 };
    const response = await post(fx.traveller, share, [fixAt(2), jump]);
    expect(response.status).toBe(202);
    expect(await storedFlags(share)).toEqual([0, MOCK_FLAG_IMPLAUSIBLE]);
  });

  it('requires a session and a valid batch', async () => {
    const share = await openShare(fx.traveller.uid, 'help');
    const anonymous = await harness.request('/v1/loc', {
      method: 'POST',
      body: JSON.stringify({ share_id: share, fixes: [fixAt(1)] }),
    });
    expect(anonymous.status).toBe(401);
    expect((await post(fx.traveller, share, [])).status).toBe(422);
  });
});

describe('flagBatch', () => {
  it('orders fixes by time and keeps client flags', () => {
    const fixes: LocationFix[] = [
      { ...fixAt(1), activity: 'walking', mock: 2 },
      { ...fixAt(5), activity: 'walking', mock: 0 },
    ];
    expect(flagBatch(fixes).map((f) => f.mock)).toEqual([0, 2]);
  });
});
