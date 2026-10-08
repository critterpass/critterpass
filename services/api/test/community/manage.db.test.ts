/**
 * Looking after a published crew plan, and what other travellers do with it, on the real stack:
 * the requester or an organiser changes what it shows (before and after everyone agreed, never
 * once it is down), any member revokes a read-only link, a traveller saves and unsaves it without
 * counting twice, and a member of another crew suggests it to their organiser in crew chat.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCommunityCommands } from '../../src/commands/community';
import { startJobProducer } from '../../src/jobs/producer';
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
let producer: PgBoss;
let crewA: SetupCrew;
let crewB: SetupCrew;
let organiser: SignedIn;
let requester: SignedIn;
let bystander: SignedIn;
let planId: string;

const hidden = { names: false, costs: true, photos: true };
const named = { names: true, costs: false, photos: true };

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

/** A one-day current plan with two places on the crew's trip. */
async function givePlan(crew: SetupCrew): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status, cost_pp_minor, currency)
       VALUES ($1, 'crew', 'current', 50000, 'USD') RETURNING id`,
      [crew.tripId],
    );
    const version = rows[0]!.id;
    await tx.query(
      `UPDATE trips SET current_version_id = $2, start_date = '2026-04-03', end_date = '2026-04-03'
        WHERE id = $1`,
      [crew.tripId, version],
    );
    const { rows: day } = await tx.query<{ id: string }>(
      'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
      [version, crew.tripId],
    );
    for (const name of ['Kinkaku-ji', 'Nishiki']) {
      const { rows: poi } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         SELECT destination_id, $2, 'temple_shrine', 35.03, 135.72 FROM trips WHERE id = $1
         RETURNING id`,
        [crew.tripId, name],
      );
      await tx.query(
        'INSERT INTO plan_items (version_id, day_id, trip_id, poi_id) VALUES ($1, $2, $3, $4)',
        [version, day[0]!.id, crew.tripId, poi[0]!.id],
      );
    }
  });
}

async function planRow() {
  const { rows } = await harness.pool.query<{
    status: string;
    toggles: object;
    saves_count: number;
  }>('SELECT status, toggles, saves_count FROM shared_plans WHERE id = $1', [planId]);
  return rows[0];
}

async function eventCount(type: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM domain_events WHERE type = $1',
    [type],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => registerCommunityCommands(registry));
  producer = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  crewA = await buildSetupCrew(harness, 3);
  crewB = await buildSetupCrew(harness, 2);
  await seatAll(crewA);
  await seatAll(crewB);
  await givePlan(crewA);
  [organiser, requester, bystander] = crewA.members as [SignedIn, SignedIn, SignedIn];
}, 240_000);

afterAll(async () => {
  await producer?.stop();
  await harness?.stop();
});

describe('update_shared_plan', () => {
  it('keeps new toggles while the crew is still agreeing', async () => {
    const asked = await harness.run(requester, 'publish_shared_plan', {
      trip_id: crewA.tripId,
      toggles: hidden,
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(200);
    planId = resultOf<{ shared_plan_id: string }>(asked).shared_plan_id;

    const changed = await harness.run(requester, 'update_shared_plan', {
      shared_plan_id: planId,
      toggles: named,
    });
    expect(resultOf(changed)).toEqual({ shared_plan_id: planId, status: 'pending_consent' });
    expect(await planRow()).toMatchObject({ status: 'pending_consent', toggles: named });
  });

  it('is the requester’s and the organisers’ alone', async () => {
    const byMember = await harness.run(bystander, 'update_shared_plan', {
      shared_plan_id: planId,
      toggles: hidden,
    });
    expect(errorOf(byMember)).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'not_organiser' },
    });
    const byStranger = await harness.run(crewB.organiser, 'update_shared_plan', {
      shared_plan_id: planId,
      toggles: hidden,
    });
    expect(errorOf(byStranger)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });
    expect(await planRow()).toMatchObject({ toggles: named });
  });

  it('rebuilds the public copy when an organiser changes a published plan', async () => {
    for (const member of [organiser, bystander]) {
      const agreed = await harness.run(member, 'respond_publish_consent', {
        shared_plan_id: planId,
        approve: true,
      });
      expect(agreed.status).toBe(200);
    }
    expect(await planRow()).toMatchObject({ status: 'published' });
    const before = await eventCount('shared_plan.updated');
    const changed = await harness.run(organiser, 'update_shared_plan', {
      shared_plan_id: planId,
      toggles: hidden,
    });
    expect(resultOf(changed)).toEqual({ shared_plan_id: planId, status: 'published' });
    expect(await planRow()).toMatchObject({ status: 'published', toggles: hidden });
    expect(await eventCount('shared_plan.updated')).toBe(before + 1);
  });
});

describe('save_shared_plan and unsave_shared_plan', () => {
  it('counts each traveller once, however often they tap', async () => {
    const saver = crewB.members[1]!;
    for (let i = 0; i < 2; i += 1) {
      const saved = await harness.run(saver, 'save_shared_plan', { shared_plan_id: planId });
      expect(resultOf(saved)).toEqual({ saved: true });
    }
    expect(await planRow()).toMatchObject({ saves_count: 1 });
    expect(await eventCount('shared_plan.saved')).toBe(1);
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM saved_items WHERE user_id = $1 AND kind = 'plan' AND ref_id = $2",
      [saver.uid, planId],
    );
    expect(rows).toHaveLength(1);

    for (let i = 0; i < 2; i += 1) {
      const unsaved = await harness.run(saver, 'unsave_shared_plan', { shared_plan_id: planId });
      expect(resultOf(unsaved)).toEqual({ saved: false });
    }
    expect(await planRow()).toMatchObject({ saves_count: 0 });
    expect(await eventCount('shared_plan.unsaved')).toBe(1);
  });

  it('refuses to save a plan that is not published', async () => {
    const missing = await harness.run(crewB.organiser, 'save_shared_plan', {
      shared_plan_id: generateUuidV7(),
    });
    expect(errorOf(missing)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'shared_plan' },
    });
  });

  it('never lowers the count for a traveller who had not saved it', async () => {
    const other = crewB.organiser;
    expect((await harness.run(other, 'save_shared_plan', { shared_plan_id: planId })).status).toBe(
      200,
    );
    const unsaved = await harness.run(crewB.members[1]!, 'unsave_shared_plan', {
      shared_plan_id: planId,
    });
    expect(resultOf(unsaved)).toEqual({ saved: false });
    expect(await planRow()).toMatchObject({ saves_count: 1 });
  });
});

describe('suggest_shared_plan_to_organiser', () => {
  const suggestions = async (crewId: string) =>
    (
      await harness.pool.query<{ ref_id: string }>(
        "SELECT ref_id FROM messages WHERE crew_id = $1 AND ref_kind = 'shared_plan_suggested'",
        [crewId],
      )
    ).rows;

  it('posts one line in the member’s own crew chat that links to the plan', async () => {
    const member = crewB.members[1]!;
    const suggested = await harness.run(member, 'suggest_shared_plan_to_organiser', {
      shared_plan_id: planId,
      trip_id: crewB.tripId,
    });
    expect(resultOf(suggested)).toEqual({ suggested: true });
    expect(await suggestions(crewB.crewId)).toEqual([{ ref_id: planId }]);
    const { rows } = await harness.pool.query<{ actor_id: string }>(
      "SELECT actor_id FROM domain_events WHERE type = 'shared_plan.suggested' AND trip_id = $1",
      [crewB.tripId],
    );
    expect(rows).toEqual([{ actor_id: member.uid }]);
  });

  it('refuses a trip the member is not on, and a plan that is not published', async () => {
    const intoOtherTrip = await harness.run(bystander, 'suggest_shared_plan_to_organiser', {
      shared_plan_id: planId,
      trip_id: crewB.tripId,
    });
    expect(errorOf(intoOtherTrip)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });
    const unknown = await harness.run(crewB.organiser, 'suggest_shared_plan_to_organiser', {
      shared_plan_id: generateUuidV7(),
      trip_id: crewB.tripId,
    });
    expect(errorOf(unknown)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'shared_plan' },
    });
    expect(await suggestions(crewB.crewId)).toHaveLength(1);
    expect(await suggestions(crewA.crewId)).toEqual([]);
  });
});

describe('revoke_plan_link', () => {
  let linkId: string;
  const revokedAt = async () =>
    (
      await harness.pool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM plan_links WHERE id = $1',
        [linkId],
      )
    ).rows[0]!.revoked_at;

  it('is refused to someone outside the trip, and for a link that does not exist', async () => {
    const made = await harness.run(requester, 'create_plan_link', { trip_id: crewA.tripId });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    linkId = resultOf<{ link_id: string }>(made).link_id;

    const byStranger = await harness.run(crewB.organiser, 'revoke_plan_link', { link_id: linkId });
    expect(errorOf(byStranger)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'link' } });
    const unknown = await harness.run(requester, 'revoke_plan_link', {
      link_id: generateUuidV7(),
    });
    expect(errorOf(unknown)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'link' } });
    expect(await revokedAt()).toBeNull();
  });

  it('lets any member switch it off, and keeps the first time on a second revoke', async () => {
    const revoked = await harness.run(bystander, 'revoke_plan_link', { link_id: linkId });
    expect(resultOf(revoked)).toEqual({ revoked: true });
    const first = await revokedAt();
    expect(first).not.toBeNull();
    const again = await harness.run(organiser, 'revoke_plan_link', { link_id: linkId });
    expect(resultOf(again)).toEqual({ revoked: true });
    expect(await revokedAt()).toEqual(first);
  });
});

describe('once the plan is down', () => {
  it('takes no new toggles and no new saves', async () => {
    const down = await harness.run(organiser, 'unpublish_shared_plan', { shared_plan_id: planId });
    expect(resultOf(down)).toEqual({ shared_plan_id: planId, status: 'unpublished' });
    const changed = await harness.run(organiser, 'update_shared_plan', {
      shared_plan_id: planId,
      toggles: named,
    });
    expect(errorOf(changed)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'not_published' },
    });
    const saved = await harness.run(crewB.members[1]!, 'save_shared_plan', {
      shared_plan_id: planId,
    });
    expect(errorOf(saved).code).toBe('NOT_FOUND');
  });
});
