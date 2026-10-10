/**
 * The free first trip's "three days left" timer and push. The timer raises `ftf.ending_soon` only
 * for an open, unrevoked window in its last three days; the push reaches the people on the trip
 * who would lose its perks: not someone out of the trip, not someone with Pass+ of their own, and
 * nobody when a boost of the trip's own outlasts the window.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  composeFtfEnding,
  ftfEndingAudience,
  remindFtfEnding,
} from '../../src/jobs/billing/ftf-ending';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const ENDS = new Date('2026-10-26T00:00:00Z');
const DUE = new Date('2026-10-23T00:01:00Z');

interface Granted {
  readonly grantId: string;
  readonly crewId: string;
  readonly tripId: string;
  readonly seated: string;
  readonly subscriber: string;
  readonly out: string;
}

async function granted(decision = 'allowed'): Promise<Granted> {
  return withSystem(harness.pool, async (tx) => {
    const uids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, tz) VALUES (uuidv7(), 'Asia/Singapore') RETURNING id",
      );
      uids.push(rows[0]!.id);
    }
    const [seated, subscriber, out] = uids as [string, string, string];
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name) VALUES ('The Bali Six') RETURNING id",
    );
    const crewId = crew.rows[0]!.id;
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'in_trip') RETURNING id",
      [crewId],
    );
    const tripId = trip.rows[0]!.id;
    for (const uid of uids) {
      await tx.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, uid]);
      await tx.query(
        'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
        [tripId, uid, uid === seated ? 'organiser' : 'member', uid === out ? 'out' : 'in'],
      );
    }
    await tx.query(
      `INSERT INTO subscriptions (user_id, platform, product_key, status, auto_renew, period_end)
       VALUES ($1, 'app_store', 'pass_yearly', 'active', true, '2027-11-02')`,
      [subscriber],
    );
    const grant = await tx.query<{ id: string }>(
      `INSERT INTO ftf_grants (crew_id, trip_id, organiser_id, starts_at, ends_at,
         member_overlap_hash, abuse_decision)
       VALUES ($1, $2, $3, '2026-10-01', $4, repeat('a', 64), $5) RETURNING id`,
      [crewId, tripId, seated, ENDS, decision],
    );
    return { grantId: grant.rows[0]!.id, crewId, tripId, seated, subscriber, out };
  });
}

async function endingEvents(grantId: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ payload: unknown }>(
    "SELECT payload FROM domain_events WHERE type = 'ftf.ending_soon' AND aggregate_id = $1",
    [grantId],
  );
  return rows.map((row) => row.payload);
}

function event(g: Granted) {
  return {
    payload: { trip_id: g.tripId, crew_id: g.crewId, ends_at: ENDS.toISOString() },
    tripId: g.tripId,
  };
}

describe('ftf.ending', () => {
  it('raises the ending three days before the window closes', async () => {
    const g = await granted();
    expect(await remindFtfEnding(harness.pool, { ref_id: g.grantId }, DUE)).toBe('reminded');
    expect(await endingEvents(g.grantId)).toEqual([
      {
        crew_id: g.crewId,
        trip_id: g.tripId,
        grant_id: g.grantId,
        ends_at: ENDS.toISOString(),
      },
    ]);
  });

  it('says nothing for a revoked grant, a window that moved later or one already closed', async () => {
    const revoked = await granted('revoked');
    expect(await remindFtfEnding(harness.pool, { ref_id: revoked.grantId }, DUE)).toBe('gone');
    const g = await granted();
    const early = new Date('2026-10-20T00:00:00Z');
    expect(await remindFtfEnding(harness.pool, { ref_id: g.grantId }, early)).toBe('gone');
    const late = new Date('2026-10-27T00:00:00Z');
    expect(await remindFtfEnding(harness.pool, { ref_id: g.grantId }, late)).toBe('gone');
    expect(await endingEvents(g.grantId)).toEqual([]);
  });

  it('tells only the people who would lose the perks', async () => {
    const g = await granted();
    const audience = await withSystem(harness.pool, (tx) => ftfEndingAudience(tx, event(g)));
    expect(audience).toEqual([g.seated]);
  });

  it('tells nobody when a boost of the trip outlasts the window', async () => {
    const g = await granted();
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_boosts (trip_id, crew_id, source, starts_at, ends_at, status)
         VALUES ($1, $2, 'promo', '2026-10-01', '2026-11-30', 'active')`,
        [g.tripId, g.crewId],
      ),
    );
    expect(await withSystem(harness.pool, (tx) => ftfEndingAudience(tx, event(g)))).toEqual([]);
  });

  it('writes the days left and links to the ending page', async () => {
    const g = await granted();
    expect(composeFtfEnding(event(g), DUE)).toMatchObject({
      vars: { days: 3, date: '26 Oct' },
      deepLink: `/you/plan/first-trip-ending/${g.tripId}`,
    });
    expect(composeFtfEnding(event(g), new Date('2026-10-27T00:00:00Z'))).toBeNull();
  });
});
