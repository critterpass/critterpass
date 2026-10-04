/**
 * A plan check FIX on the real stack: an organiser's one-tap fix applies at once with a
 * `check_fix` guide action, and undoing it from the trip feed puts the plan's items back; a
 * member's fix goes to the crew as a change set; an issue from an older plan is stale; FIX ALL
 * drafts one change set that only its author can see.
 */
import { randomUUID } from 'node:crypto';

import { withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { undoGuideActionCommand } from '../../../src/ai/undo-guide-action';
import { registerCheckCommands } from '../../../src/commands/checks';
import { planStaySource } from '../../../src/planning/fit/context';
import { registerFixerRoutes } from '../../../src/planning/fixers/routes';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

const deps = { stays: planStaySource, now: () => new Date() };
let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;

async function current(): Promise<{ versionId: string; dayId: string }> {
  const { rows } = await harness.pool.query<{ version: string; day: string }>(
    `SELECT t.current_version_id AS version, d.id AS day FROM trips t
       JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 1 WHERE t.id = $1`,
    [crew.tripId],
  );
  return { versionId: rows[0]!.version, dayId: rows[0]!.day };
}

async function walkStarts(): Promise<string> {
  const { rows } = await harness.pool.query<{ starts_at: Date }>(
    `SELECT i.starts_at FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
      WHERE t.id = $1 AND i.stable_id = $2`,
    [crew.tripId, plan.walk],
  );
  return rows[0]!.starts_at.toISOString();
}

/** A clash issue on the current plan whose one-tap fix moves the walk to `hour`. */
async function issue(hour: number, fix: 'apply' | 'none' = 'apply'): Promise<string> {
  const { versionId, dayId } = await current();
  const date = plan.dates[0]!;
  const ops = [
    {
      op: 'retime',
      target: plan.walk,
      before: { starts_at: tokyo(date, 9), ends_at: tokyo(date, 11) },
      after: { starts_at: tokyo(date, hour), ends_at: tokyo(date, hour + 2) },
      reason: 'check_fix_clash',
      affected_user_ids: [],
      booking_impact: false,
    },
  ];
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids, params, fix, rank, fingerprint)
       VALUES ($1, $2, 'clash', 'fix', $3, $4::uuid[], $5, $6, 0, $7) RETURNING id`,
      [
        crew.tripId,
        versionId,
        dayId,
        [plan.walk, plan.dinner],
        JSON.stringify({ first: plan.walk, second: plan.dinner, short_minutes: 30 }),
        JSON.stringify(fix === 'apply' ? { kind: 'apply', ops } : { kind: 'none' }),
        randomUUID(),
      ],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  harness = await startSetupHarness(
    (registry) => {
      registerCheckCommands(registry, deps);
      registry.register(undoGuideActionCommand);
    },
    (app, doors) => registerFixerRoutes(app, doors, deps),
  );
  crew = await buildSetupCrew(harness, 3);
  await withSystem(harness.pool, async (tx) => {
    for (const member of crew.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [crew.tripId, member.uid],
      );
    }
  });
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('apply_check_fix', () => {
  it('applies an organiser fix at once, and undo from the trip feed puts the plan back', async () => {
    const before = await walkStarts();
    const { versionId } = await current();
    const applied = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: await issue(12),
      base_version: versionId,
    });
    const result = resultOf<{ applied: boolean; guide_action_id: string }>(applied);
    expect(result.applied).toBe(true);
    expect(await walkStarts()).toBe(tokyo(plan.dates[0]!, 12));
    const action = await harness.pool.query<{ kind: string; status: string; reversible: boolean }>(
      'SELECT kind, status, reversible, undo_until IS NOT NULL AS has_undo FROM guide_actions WHERE id = $1',
      [result.guide_action_id],
    );
    expect(action.rows[0]).toMatchObject({ kind: 'check_fix', status: 'done', reversible: true });
    const undone = await harness.run(crew.organiser, 'undo_guide_action', {
      action_id: result.guide_action_id,
    });
    expect(undone.status).toBe(200);
    expect(await walkStarts()).toBe(before);
  });

  it("sends a member's fix to the crew as a change set", async () => {
    const { versionId } = await current();
    const sent = await harness.run(crew.members[1]!, 'apply_check_fix', {
      issue_id: await issue(13),
      base_version: versionId,
    });
    const result = resultOf<{ applied: boolean; change_set_id: string }>(sent);
    expect(result.applied).toBe(false);
    const set = await harness.pool.query<{ status: string; trigger: string; author_id: string }>(
      'SELECT status, trigger, author_id FROM change_sets WHERE id = $1',
      [result.change_set_id],
    );
    expect(set.rows[0]).toMatchObject({ trigger: 'check', author_id: crew.members[1]!.uid });
    expect(['voting', 'applied']).toContain(set.rows[0]?.status);
  });

  it('refuses a stale issue and an issue with no one-tap fix', async () => {
    const stale = await issue(14);
    const { versionId } = await current();
    await harness.pool.query(
      'UPDATE plan_check_issues SET version_id = (SELECT id FROM itinerary_versions WHERE trip_id = $1 AND id <> $2 LIMIT 1) WHERE id = $3',
      [crew.tripId, versionId, stale],
    );
    const refused = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: stale,
      base_version: versionId,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'stale_issue' },
    });
    const none = await harness.run(crew.organiser, 'apply_check_fix', {
      issue_id: await issue(15, 'none'),
      base_version: versionId,
    });
    expect(errorOf(none)).toMatchObject({ code: 'STATE_INVALID', detail: { reason: 'no_fix' } });
  });
});

describe('FIX ALL', () => {
  it("drafts one change set of the chosen fixes, its author's alone", async () => {
    const first = await issue(16);
    const response = await harness.request(`/v1/trips/${crew.tripId}/check/fix-all`, {
      method: 'POST',
      headers: { cookie: crew.members[1]!.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ issue_ids: [first] }),
    });
    expect(response.status).toBe(200);
    const { change_set_id: id } = (await response.json()) as { change_set_id: string };
    const set = await harness.pool.query<{ status: string; trigger: string; ops: unknown[] }>(
      'SELECT status, trigger, ops FROM change_sets WHERE id = $1',
      [id],
    );
    expect(set.rows[0]).toMatchObject({ status: 'draft', trigger: 'check' });
    expect(set.rows[0]?.ops).toHaveLength(1);
    const seenBy = (uid: string) =>
      withUser(
        harness.pool,
        uid,
        'unknown',
        async (tx) => (await tx.query('SELECT 1 FROM change_sets WHERE id = $1', [id])).rowCount,
      );
    expect(await seenBy(crew.members[1]!.uid)).toBe(1);
    expect(await seenBy(crew.members[2]!.uid)).toBe(0);
  });
});
