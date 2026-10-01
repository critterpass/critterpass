/**
 * `location.fixes_ttl` and `visits.ttl` against a real migrated Postgres: fixture rows go through
 * the owner connection so times can be back-dated; the jobs run as app_system as in production.
 */
import { randomUUID } from 'node:crypto';

import { canTransitionTrip, TRIP_STATUSES, type TripStatus } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { purgeExpiredFixes } from '../../../src/jobs/location/fixes-ttl';
import { expireVisits } from '../../../src/jobs/location/visits-ttl';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

let harness: JobsHarness;
interface Row {
  readonly id: string;
  readonly later: boolean;
}
const q = (sql: string, params: unknown[] = []) => harness.pool.query<Row>(sql, params);

let uid: string;
let tripId: string;
let poiId: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  uid = randomUUID();
  await q("INSERT INTO users (id, status) VALUES ($1, 'registered')", [uid]);
  const crew = await q("INSERT INTO crews (name, created_by) VALUES ('ttl', $1) RETURNING id", [
    uid,
  ]);
  const trip = await q("INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id", [
    crew.rows[0]!.id,
  ]);
  tripId = trip.rows[0]!.id;
  const dest = await q(
    "INSERT INTO destinations (slug, name) VALUES ('ttl-dest', 'TTL') RETURNING id",
  );
  const poi = await q(
    "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'P', 'food', 0, 0) RETURNING id",
    [dest.rows[0]!.id],
  );
  poiId = poi.rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

/** Walks the trip through legal transitions (shortest path) to `target`. */
async function moveTrip(target: TripStatus): Promise<void> {
  const from = new Map<TripStatus, TripStatus>();
  const queue: TripStatus[] = ['voting'];
  while (queue.length > 0 && !from.has(target)) {
    const current = queue.shift()!;
    for (const next of TRIP_STATUSES) {
      if (next !== 'voting' && !from.has(next) && canTransitionTrip(current, next)) {
        from.set(next, current);
        queue.push(next);
      }
    }
  }
  const path: TripStatus[] = [];
  for (let step: TripStatus | undefined = target; step !== undefined && step !== 'voting';) {
    path.unshift(step);
    step = from.get(step);
  }
  for (const status of path) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
}

async function share(reason: string, endsAt: string | null): Promise<string> {
  const { rows } = await q(
    `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
     VALUES ($1, $2, $3, now() - interval '3 days', $4) RETURNING id`,
    [tripId, uid, reason, endsAt],
  );
  return rows[0]!.id;
}

async function fix(shareId: string, ageMinutes: number): Promise<string> {
  const { rows } = await q(
    `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, at)
     VALUES ($1, $2, $3, 0, 0, 5, now() - make_interval(mins => $4)) RETURNING id`,
    [uid, tripId, shareId, ageMinutes],
  );
  return rows[0]!.id;
}

async function remaining(ids: readonly string[]): Promise<string[]> {
  const { rows } = await q('SELECT id FROM location_fixes WHERE id = ANY ($1::uuid[])', [ids]);
  return rows.map((row) => row.id);
}

describe('location.fixes_ttl', () => {
  it('deletes 16-minute-old fixes, keeps fresh ones and those of an open or recent SOS', async () => {
    const help = await share('help', null);
    const openSos = await share('sos', null);
    const recentSos = await share('sos', new Date(Date.now() - 60 * 60_000).toISOString());
    const oldSos = await share('sos', new Date(Date.now() - 25 * 60 * 60_000).toISOString());
    const stale = await fix(help, 16);
    const fresh = await fix(help, 10);
    const sosKept = await fix(openSos, 120);
    const sosRecent = await fix(recentSos, 120);
    const sosOld = await fix(oldSos, 26 * 60);

    const deleted = await purgeExpiredFixes(harness.pool, { batchSize: 1 });
    expect(deleted).toBe(2);
    expect((await remaining([stale, fresh, sosKept, sosRecent, sosOld])).sort()).toEqual(
      [fresh, sosKept, sosRecent].sort(),
    );
  });
});

describe('visits.ttl', () => {
  it('schedules visits of an archived trip for +30 days, then deletes them when due', async () => {
    const visitId = randomUUID();
    await q(
      `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at)
       VALUES ($1, $2, $3, $4, 'manual', now())`,
      [visitId, uid, tripId, poiId],
    );
    expect(await expireVisits(harness.pool)).toEqual({ scheduled: 0, deleted: 0 });

    await moveTrip('archived');
    expect(await expireVisits(harness.pool)).toEqual({ scheduled: 1, deleted: 0 });
    const { rows } = await q(
      "SELECT expires_at > now() + interval '29 days' AS later FROM visits WHERE id = $1",
      [visitId],
    );
    expect(rows[0]!.later).toBe(true);

    const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60_000);
    expect(await expireVisits(harness.pool, { now: in31Days, batchSize: 1 })).toEqual({
      scheduled: 0,
      deleted: 1,
    });
    expect((await q('SELECT 1 FROM visits WHERE id = $1', [visitId])).rowCount).toBe(0);
  });
});
