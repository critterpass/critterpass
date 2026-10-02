/**
 * Running late on a real pg-boss runtime, from the events the api appends: the options are worked
 * out when the disruption opens; a push on the late member's own item retimes it through the
 * executor (with UNDO); sitting it out takes it off the plan as that member's own yes; with others
 * waiting and someone running the place, the only thing that happens is a draft nobody has sent,
 * and a changed pick takes the earlier draft and its vote back. The push tells the late ones and
 * the waiting ones different things, and the upkeep job marks a silent journey and closes a
 * disruption whose item is over. The guide's words fall back to templates (no model here).
 */
import { writeLateCopy } from '@cp/ai';
import { appendDomainEvent, onEventAppended, withSystem } from '@cp/db';
import { DISRUPTION_PUSH, lateOptionsSchema, type DisruptionAction } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guideActionExecuteJob } from '../../src/guide-actions';
import { disruptionEventHook } from '../../src/jobs/disruptions/hooks';
import { sweepJourneys } from '../../src/jobs/disruptions/journey-stale';
import type { LateWriter } from '../../src/jobs/disruptions/late-options';
import { disruptionReactJob } from '../../src/jobs/disruptions/react';
import { registerLateNotifications } from '../../src/jobs/disruptions/running-late';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-15T00:00:00Z');
const MIN = 60_000;
let harness: JobsHarness;
let fx: GuidePlanFixture;

const templates: LateWriter = (_guide, input) => writeLateCopy(undefined, 'tokek', input);

interface Late {
  id: string;
  status: string;
  summary: string;
  options: unknown;
  actions: DisruptionAction[];
  facts: Record<string, string | number>;
}

async function late(id: string): Promise<Late> {
  const { rows } = await harness.pool.query<Late>(
    'SELECT id, status, summary, options, actions, facts FROM disruptions WHERE id = $1',
    [id],
  );
  return rows[0] as Late;
}

const rowOf = async (id: string, rowId: string) =>
  (await late(id)).actions.find((action) => action.id === rowId);

async function waitFor(check: () => Promise<boolean>, ms = 45_000): Promise<void> {
  await until(check, ms).catch(async (error: unknown) => {
    const { rows } = await harness.pool.query(
      "SELECT name, state, output FROM pgboss.job WHERE state IN ('retry', 'failed')",
    );
    throw new Error(`${String(error)}: ${JSON.stringify(rows).slice(0, 2000)}`);
  });
}

async function names(): Promise<void> {
  for (const [id, name] of [
    [fx.rinId, 'Rin'],
    [fx.mayaId, 'Maya'],
    [fx.organiserId, 'Dev'],
  ]) {
    await harness.pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [id, name]);
  }
}

/** The disruption as the api's journey check opens it, with its `running_late.detected`. */
async function openLate(input: {
  stableId: string;
  party: string[];
  waiting: string[];
  lateMin: number;
  title: string;
  cause?: 'traffic' | 'manual';
}): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const item = await tx.query<{ id: string; starts_at: Date }>(
      `SELECT pi.id, pi.starts_at FROM plan_items pi
         JOIN trips t ON t.current_version_id = pi.version_id
        WHERE t.id = $1 AND pi.stable_id = $2`,
      [fx.tripId, input.stableId],
    );
    const found = item.rows[0];
    if (found === undefined) throw new Error('item missing');
    const etaAt = new Date(found.starts_at.getTime() + input.lateMin * MIN).toISOString();
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, ref_kind, ref_id, title, summary,
         affected, facts, source_snapshot)
       VALUES ($1, 'running_late', $2, $3, 'plan_item', $4, $5, '', $6, $7, $8) RETURNING id`,
      [
        fx.tripId,
        input.cause ?? 'traffic',
        `late:${input.stableId}`,
        found.id,
        `${input.title} · +${String(input.lateMin)} min`,
        JSON.stringify({
          traveller_ids: input.party,
          item_stable_ids: [input.stableId],
          unaffected_ids: input.waiting,
        }),
        JSON.stringify({ title: input.title, late_min: input.lateMin, mode: 'drive' }),
        JSON.stringify({
          item_id: found.id,
          checks: Object.fromEntries(input.party.map((uid) => [uid, { eta_at: etaAt }])),
        }),
      ],
    );
    const id = rows[0]?.id as string;
    await appendDomainEvent(tx, {
      type: 'running_late.detected',
      aggregateKind: 'trip',
      aggregateId: fx.tripId,
      actorKind: 'user',
      actorId: input.party[0] ?? null,
      crewId: fx.crewId,
      tripId: fx.tripId,
      payload: {
        trip_id: fx.tripId,
        disruption_id: id,
        plan_item_id: found.id,
        late_min: input.lateMin,
      },
    });
    return id;
  });
}

/** What the api's `choose_late_option` leaves behind: the pick on the row, and its event. */
async function choose(id: string, option: string, uid: string): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      'UPDATE disruptions SET chosen_option_id = $2, chosen_by = $3, version = version + 1 WHERE id = $1',
      [id, option, uid],
    );
    await appendDomainEvent(tx, {
      type: 'late_option.chosen',
      aggregateKind: 'trip',
      aggregateId: fx.tripId,
      actorKind: 'user',
      actorId: uid,
      crewId: fx.crewId,
      tripId: fx.tripId,
      payload: { trip_id: fx.tripId, disruption_id: id, option },
    });
  });
}

async function itemStart(stableId: string): Promise<string | undefined> {
  const { rows } = await harness.pool.query<{ starts_at: Date }>(
    `SELECT pi.starts_at FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
      WHERE t.id = $1 AND pi.stable_id = $2`,
    [fx.tripId, stableId],
  );
  return rows[0]?.starts_at.toISOString();
}

const optionsOf = async (id: string) => lateOptionsSchema.parse((await late(id)).options);

beforeAll(async () => {
  harness = await startJobsHarness();
  fx = await buildGuidePlan(harness.pool, { inTrip: true, now: NOW });
  await harness.pool.query("UPDATE trips SET tz = 'Asia/Makassar' WHERE id = $1", [fx.tripId]);
  await names();
  onEventAppended(disruptionEventHook);
  registerLateNotifications();
  await harness.startRuntime([
    disruptionReactJob(templates),
    guideActionExecuteJob({ now: () => NOW }),
  ]);
}, 240_000);

afterAll(async () => {
  await harness.stopAll();
  await harness.close();
});

describe("running late for the member's own item", () => {
  let id: string;
  const retime = () => `retime_item:${fx.pickup.stableId}`;
  const skip = () => `skip_item:${fx.pickup.stableId}`;

  it('works the options out when the disruption opens', async () => {
    id = await openLate({
      stableId: fx.pickup.stableId,
      party: [fx.rinId],
      waiting: [],
      lateMin: 25,
      title: 'Gate B',
    });
    await waitFor(async () => (await optionsOf(id)).length === 4);
    const options = await optionsOf(id);
    expect(options.map((o) => [o.id, o.offered, o.recommended])).toEqual([
      ['push', true, true],
      ['walk', false, false],
      ['skip', true, false],
      ['car', false, false],
    ]);
    // 10:00 UTC is 18:00 in Bali; 25 minutes late rounds up to a 25-minute push.
    expect(options[0]).toMatchObject({
      split: false,
      new_start: new Date(fx.pickup.startsAt.getTime() + 25 * MIN).toISOString(),
      detail: 'Gate B moves to 18:25.',
    });
    expect((await late(id)).summary).toBe('Traffic is heavy on the way to Gate B.');
  });

  it('retimes it on its own when pushed, through the executor', async () => {
    await choose(id, 'push', fx.rinId);
    await waitFor(async () => (await rowOf(id, retime()))?.state === 'done');
    expect(await rowOf(id, retime())).toMatchObject({ autonomous: true, reversible: true });
    expect(await itemStart(fx.pickup.stableId)).toBe(
      new Date(fx.pickup.startsAt.getTime() + 25 * MIN).toISOString(),
    );
  });

  it("takes it off the plan when sat out, approved as the late member's own yes", async () => {
    await choose(id, 'skip', fx.rinId);
    await waitFor(async () => (await rowOf(id, skip()))?.state === 'done');
    expect(await itemStart(fx.pickup.stableId)).toBeUndefined();
    const row = await rowOf(id, skip());
    expect(row).toMatchObject({ autonomous: false, decided_by: fx.rinId });
    const { rows } = await harness.pool.query<{ approved_by_kind: string; approved_by: string }>(
      `SELECT cs.approved_by_kind, cs.approved_by FROM guide_actions ga
         JOIN change_sets cs ON cs.id = ga.change_set_id WHERE ga.id = $1`,
      [row?.guide_action_id],
    );
    expect(rows[0]).toEqual({ approved_by_kind: 'self', approved_by: fx.rinId });
    // The earlier retime really happened and stays on record.
    expect((await rowOf(id, retime()))?.state).toBe('done');
  });

  it('resolves once its item is over or gone from the plan', async () => {
    const swept = await sweepJourneys(harness.pool, NOW);
    expect(swept.resolved).toBe(1);
    expect((await late(id)).status).toBe('resolved');
  });
});

describe('running late with others waiting and someone running the place', () => {
  let id: string;
  let providerId: string;
  const message = () => `contact_vendor:${fx.dinner.stableId}`;

  it('splits the group and only drafts the message, as a question to the late member', async () => {
    const provider = await harness.pool.query<{ id: string }>(
      `INSERT INTO providers (trip_id, kind, name, added_by)
       VALUES ($1, 'restaurant', 'Locavore', $2) RETURNING id`,
      [fx.tripId, fx.organiserId],
    );
    providerId = provider.rows[0]?.id as string;
    await harness.pool.query(
      'UPDATE plan_items SET provider_id = $3 WHERE version_id = (SELECT current_version_id FROM trips WHERE id = $1) AND stable_id = $2',
      [fx.tripId, fx.dinner.stableId, providerId],
    );
    id = await openLate({
      stableId: fx.dinner.stableId,
      party: [fx.rinId],
      waiting: [fx.organiserId, fx.mayaId],
      lateMin: 18,
      title: 'Dinner',
    });
    await waitFor(async () => (await optionsOf(id)).length === 4);
    expect((await optionsOf(id))[0]).toMatchObject({
      id: 'push',
      offered: true,
      split: true,
      vendor_name: 'Locavore',
    });
    const before = await itemStart(fx.dinner.stableId);
    await choose(id, 'push', fx.rinId);
    await waitFor(async () => (await rowOf(id, message()))?.poll != null);
    const row = await rowOf(id, message());
    expect(row).toMatchObject({
      state: 'draft_ready',
      autonomous: false,
      affected_user_ids: [fx.rinId],
      decider: { policy: 'any_affected' },
      label: 'Tell Locavore: Rin at 20:20?',
    });
    expect((await late(id)).actions).toHaveLength(1);
    const draft = await harness.pool.query<{ status: string; proposed_by: string; body: string }>(
      'SELECT status, proposed_by, body FROM ops.vendor_messages WHERE id = $1',
      [row?.vendor_message_id],
    );
    expect(draft.rows[0]).toMatchObject({ status: 'draft', proposed_by: 'guide' });
    expect(draft.rows[0]?.body).toBe(
      'Hi Locavore, Rin will be about 18 min late for Dinner at 20:00. The others will start on time; is it all right to join at 20:20?',
    );
    // The others start as planned: nothing on the plan moved.
    expect(await itemStart(fx.dinner.stableId)).toBe(before);
  });

  it('takes the earlier draft and its vote back when the pick changes', async () => {
    const first = await rowOf(id, message());
    await choose(id, 'skip', fx.rinId);
    await waitFor(async () => (await rowOf(id, message()))?.facts['why'] === 'late_skip');
    const row = await rowOf(id, message());
    expect(row).toMatchObject({
      state: 'draft_ready',
      label: "Tell Locavore you can't make Dinner?",
    });
    expect(row?.vendor_message_id).not.toBe(first?.vendor_message_id);
    const old = await harness.pool.query<{ status: string }>(
      'SELECT status FROM ops.vendor_messages WHERE id = $1',
      [first?.vendor_message_id],
    );
    expect(old.rows[0]?.status).not.toBe('draft');
    const poll = await harness.pool.query<{ status: string }>(
      'SELECT status FROM polls WHERE id = $1',
      [first?.poll?.id],
    );
    expect(poll.rows[0]?.status).toBe('cancelled');
    // Dinner is still on for the others.
    expect(await itemStart(fx.dinner.stableId)).toBeDefined();
    expect((await late(id)).actions).toHaveLength(1);
  });

  it('tells the late ones they can choose and the waiting ones who is late', async () => {
    const registration = getRegistration('running_late.detected', 'running_late_detected');
    if (registration === undefined) throw new Error('not registered');
    const routed: RoutedEvent = {
      id: id,
      type: 'running_late.detected',
      payload: { trip_id: fx.tripId, disruption_id: id, plan_item_id: id, late_min: 18 },
      crewId: fx.crewId,
      tripId: fx.tripId,
      actorId: fx.rinId,
      occurredAt: NOW,
    };
    await withSystem(harness.pool, async (tx) => {
      expect(await registration.audience(tx, routed)).toEqual([
        fx.rinId,
        fx.organiserId,
        fx.mayaId,
      ]);
      const own = await registration.compose(tx, routed, fx.rinId);
      expect(own).toMatchObject({
        title: DISRUPTION_PUSH.lateTitle,
        body: DISRUPTION_PUSH.lateBodyYou,
        vars: { place: 'Dinner', minutes: 18 },
        deepLink: `/late/${id}`,
      });
      const waiting = await registration.compose(tx, routed, fx.mayaId);
      expect(waiting).toMatchObject({
        body: DISRUPTION_PUSH.lateBodyWaiting,
        vars: { names: 'Rin', count: 1, minutes: 18 },
      });
      // A member who reported it themselves already pinged the crew: only they hear the guide.
      await tx.query("UPDATE disruptions SET cause = 'manual' WHERE id = $1", [id]);
      expect(await registration.audience(tx, routed)).toEqual([fx.rinId]);
    });
  });

  it('marks a journey whose checks stopped, and deletes checks a day old', async () => {
    const item = await harness.pool.query<{ id: string }>(
      `SELECT pi.id FROM plan_items pi JOIN trips t ON t.current_version_id = pi.version_id
        WHERE t.id = $1 AND pi.stable_id = $2`,
      [fx.tripId, fx.dinner.stableId],
    );
    const insert = (uid: string, checkedAt: Date, disruptionId: string | null) =>
      harness.pool.query(
        `INSERT INTO journey_checks (trip_id, item_id, user_id, mode, eta_at, late_min, disruption_id,
           checked_at)
         VALUES ($1, $2, $3, 'drive', $4, 18, $5, $4)`,
        [fx.tripId, item.rows[0]?.id, uid, checkedAt, disruptionId],
      );
    await insert(fx.rinId, new Date(NOW.getTime() - 2 * MIN), id);
    await insert(fx.mayaId, new Date(NOW.getTime() - 25 * 60 * MIN), null);
    const fresh = await sweepJourneys(harness.pool, NOW);
    expect(fresh).toMatchObject({ stale: 0, resolved: 0, deleted: 1 });
    const later = await sweepJourneys(harness.pool, new Date(NOW.getTime() + 2 * MIN));
    expect(later.stale).toBe(1);
    expect((await late(id)).facts['stale']).toBe('yes');
    // Marked once, not every minute.
    expect((await sweepJourneys(harness.pool, new Date(NOW.getTime() + 3 * MIN))).stale).toBe(0);
  });
});
