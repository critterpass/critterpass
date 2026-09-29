/**
 * Redrafts on the real stack: only an organiser asks, against the draft they are looking at; with
 * one redraft left, ten requests at once get exactly one through; keeping a delivered redraft (a
 * change toggled off stays as it was) adopts it and counts it; the spent quota answers
 * `REDRAFT_LIMIT`; an unlimited trip is still held to the silent daily cap.
 */
import { randomUUID } from 'node:crypto';

import type { RedraftResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let base: string;
const stable = { a: randomUUID(), b: randomUUID(), c: randomUUID() };

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function one<T>(sql: string, values: unknown[]): Promise<T> {
  const { rows } = await harness.pool.query<{ id: T }>(sql, values);
  return rows[0]?.id as T;
}

/** A private draft of three days; day 2 holds stops a, b and c (9:00, 11:00, 14:00 local). */
async function seedDraft(tripId: string, versionOf: string | null = null): Promise<string> {
  const version = await one<string>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status, parent_id, metrics, coverage)
     VALUES ($1, 'organiser', $2, $3, '{}', '{}') RETURNING id`,
    [tripId, versionOf === null ? 'draft' : 'drafting', versionOf],
  );
  for (const dayNo of [1, 2, 3]) {
    const dayId = await one<string>(
      'INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [version, tripId, dayNo, day(40 + dayNo), `Day ${dayNo}`],
    );
    if (dayNo !== 2) continue;
    for (const [key, hour] of [
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ] as const) {
      // The candidate moves b an hour later and swaps c's time too.
      const shift = versionOf === null || key === 'a' ? 0 : 1;
      const starts = new Date(`${day(42)}T00:00:00Z`).getTime() + (hour + shift) * 3_600_000;
      await harness.pool.query(
        `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
           category, created_by_kind, amount_minor, currency, cost_model)
         VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', 'activity', 'guide', 1000, 'USD', 'per_person')`,
        [version, dayId, tripId, stable[key], new Date(starts), new Date(starts + 3_600_000)],
      );
    }
  }
  return version;
}

const request = (who: SignedIn, extra: Record<string, unknown> = {}) =>
  harness.run(who, 'request_redraft', {
    trip_id: crew.tripId,
    day: 2,
    reasons: ['slower'],
    base_version: base,
    ...extra,
  });

beforeAll(async () => {
  harness = await startSetupHarness(registerDraftCommands);
  crew = await buildSetupCrew(harness, 3);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(41),
    end: day(43),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  base = await seedDraft(crew.tripId);
  for (const status of ['drafting', 'draft_review']) {
    await harness.pool.query('UPDATE trips SET status = $2 WHERE id = $1', [crew.tripId, status]);
  }
  await harness.pool.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [
    crew.tripId,
    base,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('request_redraft', () => {
  it('reserves exactly one of the last redraft under concurrency, and keeps it', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    expect(errorOf(await request(member)).code).toBe('FORBIDDEN');
    expect(errorOf(await request(crew.organiser, { base_version: randomUUID() }))).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current_version: base },
    });

    for (let i = 0; i < 2; i += 1) {
      await harness.pool.query(
        "SELECT app.consume_quota('trip', $1, 'redrafts', 'lifetime', 3, '9999-12-31T23:59:59Z')",
        [crew.tripId],
      );
    }
    const answers = await Promise.all(Array.from({ length: 10 }, () => request(crew.organiser)));
    const accepted = answers.filter((a) => a.status === 200);
    expect(accepted).toHaveLength(1);
    const { redraft_id: redraftId } = resultOf<{ redraft_id: string }>(
      accepted[0] as { body: Record<string, unknown> },
    );
    const { rows: counted } = await harness.pool.query<{
      count: number;
      reservations: number;
      status: string;
    }>(
      `SELECT (SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1
                 AND metric = 'redrafts' AND period_key = 'lifetime') AS count,
              (SELECT count(*)::int FROM redraft_reservations WHERE trip_id = $1) AS reservations,
              (SELECT status FROM trips WHERE id = $1) AS status`,
      [crew.tripId],
    );
    expect(counted[0]).toEqual({ count: 3, reservations: 1, status: 'redrafting' });

    // What the worker delivers: a candidate version and the changes on stable ids.
    const candidate = await seedDraft(crew.tripId, base);
    const snapshot = { poi_id: null, kind: 'activity' as const, amount_minor: 1000 };
    const at = (h: number) =>
      new Date(new Date(`${day(42)}T00:00:00Z`).getTime() + h * 3_600_000).toISOString();
    const result: RedraftResult = {
      redraft_id: redraftId,
      day_no: 2,
      base_version_id: base,
      candidate_version_id: candidate,
      outcome: 'changed',
      title: 'A slower day',
      summary: 'Fewer rushes between stops.',
      changes: [
        {
          op: 'retime',
          stable_id: stable.b,
          before: { ...snapshot, starts_at: at(2), ends_at: at(3) },
          after: { ...snapshot, starts_at: at(3), ends_at: at(4) },
          reason: null,
        },
        {
          op: 'retime',
          stable_id: stable.c,
          before: { ...snapshot, starts_at: at(5), ends_at: at(6) },
          after: { ...snapshot, starts_at: at(6), ends_at: at(7) },
          reason: null,
        },
      ],
      metrics: null,
    };
    await harness.pool.query(
      "UPDATE agent_jobs SET status = 'succeeded', result_ref = $2 WHERE id = $1",
      [redraftId, JSON.stringify(result)],
    );

    const kept = await harness.run(crew.organiser, 'keep_redraft', {
      redraft_id: redraftId,
      excluded_stable_ids: [stable.c],
    });
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    const { version_id: version } = resultOf<{ version_id: string }>(kept);
    const { rows: items } = await harness.pool.query<{ stable_id: string; starts_at: Date }>(
      'SELECT stable_id, starts_at FROM plan_items WHERE version_id = $1 ORDER BY starts_at',
      [version],
    );
    const startOf = (id: string) => items.find((i) => i.stable_id === id)?.starts_at.toISOString();
    expect(startOf(stable.b)).toBe(at(3));
    expect(startOf(stable.c)).toBe(at(5));
    const { rows: settled } = await harness.pool.query<{
      reservation: string;
      status: string;
      draft: string;
    }>(
      `SELECT (SELECT status FROM redraft_reservations WHERE agent_job_id = $2) AS reservation,
              status, draft_version_id AS draft FROM trips WHERE id = $1`,
      [crew.tripId, redraftId],
    );
    expect(settled[0]).toEqual({
      reservation: 'committed',
      status: 'draft_review',
      draft: version,
    });

    base = version;
    expect(errorOf(await request(crew.organiser))).toMatchObject({
      code: 'REDRAFT_LIMIT',
      detail: { used: 3, limit: 3 },
    });
  });

  it('holds an unlimited trip to the silent daily cap', async () => {
    await harness.pool.query(
      `INSERT INTO trip_entitlements (trip_id, boost_active, redraft_limit) VALUES ($1, true, 2147483647)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = true, redraft_limit = 2147483647`,
      [crew.tripId],
    );
    await harness.pool.query(
      `SELECT app.bump_fair_use($1, 'redrafts', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 20)
         FROM generate_series(1, 20)`,
      [crew.organiser.uid],
    );
    expect(errorOf(await request(crew.organiser)).code).toBe('RATE_LIMITED');
  });
});
