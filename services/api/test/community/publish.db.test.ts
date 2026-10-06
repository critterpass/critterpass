/**
 * Crew plans on the real stack: a plan goes public only when every seat holder agrees, one "not
 * this one" stops it, the public copy carries no notes, names or faces the crew did not allow, a
 * withdrawn yes or a member leaving takes it down, another crew finds it ranked by taste and an
 * organiser copies a day of it into their trip's Ideas.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCommunityCommands } from '../../src/commands/community';
import { registerSharedPlanRoutes } from '../../src/routes/shared-plans';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';

let harness: SetupHarness;
let crewA: SetupCrew;
let crewB: SetupCrew;
let pois: string[];

async function seatAll(crew: SetupCrew): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    for (const member of crew.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [crew.tripId, member.uid],
      );
    }
  });
}

/** A two-day current plan on the crew's trip; day 1 carries a note that must never go public. */
async function givePlan(crew: SetupCrew, places: string[], start: string): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status, cost_pp_minor, currency)
       VALUES ($1, 'crew', 'current', 123456, 'USD') RETURNING id`,
      [crew.tripId],
    );
    const version = rows[0]!.id;
    await tx.query(
      `UPDATE trips SET current_version_id = $2, start_date = $3, end_date = $3::date + 1
        WHERE id = $1`,
      [crew.tripId, version, start],
    );
    for (const [index, day] of [places.slice(0, 2), places.slice(2)].entries()) {
      const { rows: dayRows } = await tx.query<{ id: string }>(
        `INSERT INTO plan_days (version_id, trip_id, day_no, theme) VALUES ($1, $2, $3, $4) RETURNING id`,
        [
          version,
          crew.tripId,
          index + 1,
          index === 0 ? 'Temples, call Mia on +81 75 123 4567' : null,
        ],
      );
      for (const poi of day) {
        await tx.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, notes)
           VALUES ($1, $2, $3, $4, 'Booking ref QX7P2K, room 402')`,
          [version, dayRows[0]!.id, crew.tripId, poi],
        );
      }
    }
  });
}

beforeAll(async () => {
  harness = await startSetupHarness(
    (registry) => registerCommunityCommands(registry),
    (app, deps) => registerSharedPlanRoutes(app, deps),
  );
  crewA = await buildSetupCrew(harness, 3);
  crewB = await buildSetupCrew(harness, 2);
  await seatAll(crewA);
  await seatAll(crewB);
  pois = await withSystem(harness.pool, async (tx) => {
    // Both crews plan Kyoto: crew B's trip moves to crew A's destination.
    await tx.query(
      `UPDATE trips SET destination_id = (SELECT destination_id FROM trips WHERE id = $1) WHERE id = $2`,
      [crewA.tripId, crewB.tripId],
    );
    await tx.query(
      `UPDATE destinations SET place_bounds = ST_GeogFromText('POLYGON((135.6 34.9, 135.9 34.9, 135.9 35.1, 135.6 35.1, 135.6 34.9))')
        WHERE id = (SELECT destination_id FROM trips WHERE id = $1)`,
      [crewA.tripId],
    );
    const ids: string[] = [];
    for (const [name, category] of [
      ['Kinkaku-ji', 'temple_shrine'],
      ['Nishiki', 'market'],
      ['Ryoan-ji', 'temple_shrine'],
    ] as const) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         SELECT destination_id, $2, $3, 35.03, 135.72 FROM trips WHERE id = $1 RETURNING id`,
        [crewA.tripId, name, category],
      );
      ids.push(rows[0]!.id);
    }
    return ids;
  });
  await givePlan(crewA, pois, '2026-04-03');
  await givePlan(crewB, [pois[0]!], '2026-04-10');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const toggles = { names: false, costs: true, photos: true };

async function publish(by: SignedIn, tripId: string) {
  return harness.run(by, 'publish_shared_plan', { trip_id: tripId, toggles });
}

async function get(session: SignedIn, path: string) {
  const response = await harness.request(path, { headers: { cookie: session.cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('publishing a crew plan', () => {
  let planId: string;

  it('waits for every seat holder, and one decline stops it without naming who', async () => {
    const [organiser, second, third] = crewA.members as [SignedIn, SignedIn, SignedIn];
    const asked = await publish(second, crewA.tripId);
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    const first = resultOf<{ shared_plan_id: string; status: string }>(asked);
    expect(first.status).toBe('pending_consent');
    await harness.run(organiser, 'respond_publish_consent', {
      shared_plan_id: first.shared_plan_id,
      approve: true,
    });
    const declined = await harness.run(third, 'respond_publish_consent', {
      shared_plan_id: first.shared_plan_id,
      approve: false,
    });
    expect(resultOf<{ status: string }>(declined).status).toBe('declined');
    const state = await get(organiser, `/v1/trips/${crewA.tripId}/shared-plan`);
    expect(state.body).toMatchObject({ plan: { status: 'declined', consents: { total: 3 } } });
    expect(JSON.stringify(state.body)).not.toContain(third.uid);
    const browse = await get(
      crewB.organiser,
      `/v1/shared-plans?destination_id=${await destination()}`,
    );
    expect(browse.body).toMatchObject({ plans: [], total: 0, pick_id: null });
  });

  it('publishes once all agree, with no notes, phone numbers, names or booking refs', async () => {
    const [organiser, second, third] = crewA.members as [SignedIn, SignedIn, SignedIn];
    const asked = resultOf<{ shared_plan_id: string }>(await publish(organiser, crewA.tripId));
    planId = asked.shared_plan_id;
    for (const member of [second, third]) {
      await harness.run(member, 'respond_publish_consent', {
        shared_plan_id: planId,
        approve: true,
      });
    }
    const detail = await get(crewB.organiser, `/v1/shared-plans/${planId}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body).toMatchObject({
      status: 'published',
      card: { crew_size: 3, crew_names: null, days_count: 2, cost_pp_rounded_minor: 124_000 },
    });
    const text = JSON.stringify(detail.body);
    for (const leak of ['QX7P2K', '4567', 'room 402', 'Member', crewA.tripId, organiser.uid]) {
      expect(text).not.toContain(leak);
    }
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM messages WHERE crew_id = $1 AND ref_kind = 'plan_published'",
      [crewA.crewId],
    );
    expect(rows).toHaveLength(1);
  });

  it('ranks it for another crew and copies one day into their Ideas', async () => {
    const browse = await get(
      crewB.organiser,
      `/v1/shared-plans?destination_id=${await destination()}&trip_id=${crewB.tripId}`,
    );
    expect(browse.body).toMatchObject({ total: 1, pick_id: planId });
    const note = await get(
      crewB.organiser,
      `/v1/shared-plans/${planId}/guide-note?trip_id=${crewB.tripId}`,
    );
    expect(note.body).toMatchObject({ overlap_days: [1], best_day: 1, overlap_places: 1 });
    const member = crewB.members[1]!;
    const refused = await harness.run(member, 'copy_shared_plan', {
      shared_plan_id: planId,
      trip_id: crewB.tripId,
      days: [2],
    });
    expect(errorOf(refused)).toMatchObject({ code: 'FORBIDDEN' });
    const copied = await harness.run(crewB.organiser, 'copy_shared_plan', {
      shared_plan_id: planId,
      trip_id: crewB.tripId,
      days: [2],
    });
    expect(copied.status, JSON.stringify(copied.body)).toBe(200);
    expect(resultOf<{ places: number }>(copied).places).toBe(1);
    const { rows } = await harness.pool.query(
      'SELECT poi_id FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL',
      [crewB.tripId],
    );
    expect(rows.map((row) => row.poi_id)).toContain(pois[2]);
  });

  it('comes down when a participant withdraws, and the link stops resolving', async () => {
    const third = crewA.members[2]!;
    const link = await harness.run(crewA.organiser, 'create_plan_link', { trip_id: crewA.tripId });
    expect(resultOf<{ url: string }>(link).url).toMatch(/\/p\//);
    await harness.run(third, 'withdraw_publish_consent', { shared_plan_id: planId });
    const detail = await get(crewB.organiser, `/v1/shared-plans/${planId}`);
    expect(detail.body).toMatchObject({ status: 'unpublished', projection: null });
    const { rows } = await harness.pool.query(
      'SELECT revoked_at FROM plan_links WHERE trip_id = $1',
      [crewA.tripId],
    );
    expect(rows[0]?.revoked_at).not.toBeNull();
  });

  it('comes down when a seat holder leaves the crew', async () => {
    const [organiser, second, third] = crewA.members as [SignedIn, SignedIn, SignedIn];
    const asked = resultOf<{ shared_plan_id: string }>(await publish(organiser, crewA.tripId));
    for (const member of [second, third]) {
      await harness.run(member, 'respond_publish_consent', {
        shared_plan_id: asked.shared_plan_id,
        approve: true,
      });
    }
    await withSystem(harness.pool, (tx) =>
      tx.query("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
        crewA.crewId,
        third.uid,
      ]),
    );
    const { rows } = await harness.pool.query<{ status: string; projection: object }>(
      'SELECT status, projection FROM shared_plans WHERE id = $1',
      [asked.shared_plan_id],
    );
    expect(rows[0]).toEqual({ status: 'unpublished', projection: {} });
  });
});

describe('rate_places', () => {
  it('keeps the verdict and queues the tip for screening, never publishing it unscreened', async () => {
    const rated = await harness.run(crewA.organiser, 'rate_places', {
      trip_id: crewA.tripId,
      verdicts: [
        { poi_id: pois[0], verdict: 'loved', tip: 'Go before 8, the garden is empty.' },
        { poi_id: pois[1], verdict: 'skip' },
      ],
    });
    expect(rated.status, JSON.stringify(rated.body)).toBe(200);
    expect(resultOf(rated)).toEqual({ rated: 2, tips: [{ poi_id: pois[0], status: 'pending' }] });
    const { rows: tips } = await harness.pool.query('SELECT 1 FROM place_tips WHERE poi_id = $1', [
      pois[0],
    ]);
    expect(tips).toHaveLength(0);
    const { rows: jobs } = await harness.pool.query(
      "SELECT data FROM pgboss.job WHERE name = 'compliance.check'",
    );
    expect(jobs.map((job) => job.data.content_kind)).toContain('rating_tip');
    const cards = await get(crewA.organiser, `/v1/trips/${crewA.tripId}/rating-cards`);
    expect(cards.body).toMatchObject({ destination_name: 'Kyoto' });
    expect(
      (cards.body['cards'] as { verdict: string | null }[]).map((card) => card.verdict),
    ).toEqual(['loved', 'skip', null]);
  });
});

async function destination(): Promise<string> {
  const { rows } = await harness.pool.query<{ destination_id: string }>(
    'SELECT destination_id FROM trips WHERE id = $1',
    [crewA.tripId],
  );
  return rows[0]!.destination_id;
}
