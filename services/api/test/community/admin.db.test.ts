/**
 * Crew plans in the console: ops sees the published plans with their open reports (and nothing of
 * the plan's days), takes one down with a reason through the audited command, the plan is gone for
 * every crew at once with its reports closed, and a role without the command is refused.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { adminSharedPlansResponseSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from '../admin/harness';
import { insertCrewWithTrip } from '../entitlements/db-fixtures';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let support: string;
let destinationId: string;

const MUST_DO = 'MUST-DO-STAYS-WITH-THE-CREW';

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, currency, tz)
     VALUES ('kyoto', 'Kyoto', 'live', 'JPY', 'Asia/Tokyo') RETURNING id`,
  );
  destinationId = rows[0]?.id ?? '';
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  support = await app.signIn('support@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

/** A published plan of a fresh crew, reported `reports` times. */
async function publishedPlan(title: string, reports = 0): Promise<{ id: string; crewId: string }> {
  const crew = await insertCrewWithTrip(harness.pool, 2);
  const id = await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO shared_plans (trip_id, destination_id, requested_by, status, title, days_count,
         crew_size, projection, published_at)
       VALUES ($1, $2, $3, 'published', $4, 3, 2, $5::jsonb, now()) RETURNING id`,
      [
        crew.tripId,
        destinationId,
        crew.memberUids[0],
        title,
        JSON.stringify({ destination_name: 'Kyoto', days_count: 3, days: [{ theme: MUST_DO }] }),
      ],
    );
    const planId = rows[0]?.id;
    if (planId === undefined) throw new Error('shared plan insert returned no id');
    if (reports > 0) {
      // Repeat reports of one subject collapse into one open row that counts them.
      const reporter = randomUUID();
      await tx.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [reporter]);
      await tx.query(
        `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, report_count)
         VALUES ($1, 'shared_plan', $2, 'spam', $3)`,
        [reporter, planId, reports],
      );
    }
    return planId;
  });
  return { id, crewId: crew.crewId };
}

async function list(status: string, cookie = ops) {
  const response = await app.request(`/v1/admin/shared-plans?status=${status}`, {
    headers: { cookie },
  });
  return { status: response.status, text: await response.text() };
}

describe('crew plans in the console', () => {
  it('lists published plans, most reported first, without the days of the plan', async () => {
    const quiet = await publishedPlan('Quiet Kyoto');
    const reported = await publishedPlan('Reported Kyoto', 2);

    const { status, text } = await list('published');
    expect(status).toBe(200);
    expect(text).not.toContain(MUST_DO);
    const items = adminSharedPlansResponseSchema.parse(JSON.parse(text)).items;
    const ids = items.map((item) => item.id);
    expect(ids.indexOf(reported.id)).toBeLessThan(ids.indexOf(quiet.id));
    expect(items.find((item) => item.id === reported.id)).toMatchObject({
      title: 'Reported Kyoto',
      destination_name: 'Kyoto',
      open_reports: 2,
      status: 'published',
    });
    expect((await list('published', support)).status).toBe(403);
  });

  it('takes a plan down with a reason, closes its reports and writes one audit row', async () => {
    const plan = await publishedPlan('Coming down', 1);

    const denied = await app.command(support, 'admin_unpublish_shared_plan', {
      id: plan.id,
      reason: 'Shows a private address',
    });
    expect(denied.status).toBe(403);

    const done = await app.command(ops, 'admin_unpublish_shared_plan', {
      id: plan.id,
      reason: 'Shows a private address',
    });
    expect(done.status).toBe(200);

    const { rows } = await harness.pool.query<{
      status: string;
      projection: unknown;
      unpublish_reason: string;
    }>('SELECT status, projection, unpublish_reason FROM shared_plans WHERE id = $1', [plan.id]);
    expect(rows).toEqual([
      { status: 'unpublished', projection: {}, unpublish_reason: 'Shows a private address' },
    ]);
    const reports = await harness.pool.query<{ status: string; verdict: string }>(
      "SELECT status, verdict FROM moderation_reports WHERE target_kind = 'shared_plan' AND target_id = $1",
      [plan.id],
    );
    expect(reports.rows).toEqual([{ status: 'actioned', verdict: 'hide' }]);
    const told = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'shared_plan.unpublished' AND crew_id = $1",
      [plan.crewId],
    );
    expect(told.rowCount).toBe(1);
    const audit = await harness.pool.query<{ reason: string }>(
      "SELECT reason FROM ops.admin_audit WHERE action = 'admin_unpublish_shared_plan' AND target_id = $1",
      [plan.id],
    );
    expect(audit.rows).toEqual([{ reason: 'Shows a private address' }]);

    const down = adminSharedPlansResponseSchema.parse(JSON.parse((await list('unpublished')).text));
    expect(down.items.find((item) => item.id === plan.id)).toMatchObject({
      unpublish_reason: 'Shows a private address',
      open_reports: 0,
    });

    const again = await app.command(ops, 'admin_unpublish_shared_plan', {
      id: plan.id,
      reason: 'Shows a private address',
    });
    expect(again.status).toBe(409);
  });
});
