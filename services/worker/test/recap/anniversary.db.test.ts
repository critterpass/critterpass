/**
 * The year-later memory against the fixture trip (./recap-world.ts), time-travelled: building the
 * recap arms one anniversary per traveller on the best day a year on, 10:00 in each traveller's own
 * zone (Dev's phone is in Los Angeles); the scan fires each exactly once at that instant, makes the
 * trip's one memory the first time and brings N-35 to each traveller in turn.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runAnniversaryScan } from '../../src/jobs/anniversary/scan';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { buildRecap } from '../../src/jobs/recap/build';
import { startRecapWorld, type RecapWorld } from './recap-world';

let world: RecapWorld;

beforeAll(async () => {
  world = await startRecapWorld();
  await world.q(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz, last_seen_at)
     VALUES ($1, $2, 'ios', '1.0.0', 'en', 'America/Los_Angeles', now())`,
    [randomUUID(), world.users.dev],
  );
  await buildRecap(
    world.harness.pool,
    { trip_id: world.tripId, reason: 'trip_ended', ended_on: '2026-10-04' },
    { router: straightLineRouter },
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

async function surfaced(): Promise<string[]> {
  const { rows } = await world.harness.pool.query<{ user_id: string }>(
    `SELECT payload->>'user_id' AS user_id FROM domain_events
      WHERE type = 'memory.surfaced' AND trip_id = $1 ORDER BY id`,
    [world.tripId],
  );
  return rows.map((row) => row.user_id);
}

const at = (iso: string) => new Date(iso);

describe('anniversary.scan', { timeout: 60_000 }, () => {
  it('arms one anniversary per traveller on the best day a year on, in their own zone', async () => {
    const rows = await world.q<{ user_id: string; fire_on: string; tz: string; fire_at: Date }>(
      `SELECT user_id, fire_on::text AS fire_on, tz, fire_at FROM anniversaries
        WHERE trip_id = $1 ORDER BY user_id`,
      [world.tripId],
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.fire_on).toBe('2027-10-03');
      const la = row.user_id === world.users.dev;
      expect(row.tz).toBe(la ? 'America/Los_Angeles' : 'Asia/Ho_Chi_Minh');
      expect(row.fire_at.toISOString()).toBe(
        la ? '2027-10-03T17:00:00.000Z' : '2027-10-03T03:00:00.000Z',
      );
    }
  });

  it('fires each exactly once at its own morning, with one memory for the trip', async () => {
    expect(await runAnniversaryScan(world.harness.pool, at('2027-10-03T02:59:59Z'))).toBe(0);
    expect(await runAnniversaryScan(world.harness.pool, at('2027-10-03T03:00:00Z'))).toBe(4);
    expect(await runAnniversaryScan(world.harness.pool, at('2027-10-03T03:00:00Z'))).toBe(0);
    expect(await runAnniversaryScan(world.harness.pool, at('2027-10-03T16:59:59Z'))).toBe(0);
    expect(await runAnniversaryScan(world.harness.pool, at('2027-10-03T17:00:00Z'))).toBe(1);
    expect(await runAnniversaryScan(world.harness.pool, at('2028-01-01T00:00:00Z'))).toBe(0);

    const { anna, ben, cora, dev, eli } = world.users;
    expect((await surfaced()).sort()).toEqual([anna, ben, cora, dev, eli].sort());
    expect((await surfaced()).at(-1)).toBe(dev);
    const memories = await world.q<{ id: string; text: string; local_date: string }>(
      `SELECT id, text, local_date::text AS local_date FROM memories WHERE trip_id = $1`,
      [world.tripId],
    );
    expect(memories.map(({ text, local_date }) => ({ text, local_date }))).toEqual([
      {
        text: 'A year ago today: Da Nang. Up and out at 04:30 for Marble Mountains.',
        local_date: '2026-10-03',
      },
    ]);
    const fired = await world.q<{ memory_id: string }>(
      "SELECT DISTINCT memory_id FROM anniversaries WHERE trip_id = $1 AND status = 'fired'",
      [world.tripId],
    );
    expect(fired).toEqual([{ memory_id: memories[0]?.id }]);
  });
});
