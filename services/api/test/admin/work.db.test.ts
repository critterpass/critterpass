/**
 * The work registry over the desk and moderation queues: what each role sees as available, claiming
 * and releasing (mirrored into the source's assignee column), a claim held by someone else, the
 * caller's items by urgency and "done today".
 */
import { workAvailableSchema, workMineSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let support: string;
let opsUid: string;
let supportUid: string;
let overdueReport: string;
let laterReport: string;
let deskTask: string;

async function insertReport(dueInHours: number): Promise<string> {
  const target = await harness.signInUser();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO moderation_reports (source, target_kind, target_id, reason, due_at)
     VALUES ('compliance', 'user', $1, 'spam', now() + make_interval(hours => $2)) RETURNING id`,
    [target.uid, dueInHours],
  );
  return rows[0]?.id ?? '';
}

beforeAll(async () => {
  harness = await startAdminHarness();
  opsUid = await harness.seedOperator('ops@critterpass.test', ['ops']);
  supportUid = await harness.seedOperator('support@critterpass.test', ['support']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  support = await app.signIn('support@critterpass.test');
  overdueReport = await insertReport(-3);
  laterReport = await insertReport(20);
  const created = await app.command(ops, 'create_concierge_task', {
    kind: 'review',
    due_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  deskTask = ((await created.json()) as { result: { id: string } }).result.id;
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function read<T>(path: string, cookie: string, parse: (body: unknown) => T): Promise<T> {
  const response = await app.request(`/v1/admin${path}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  return parse(await response.json());
}

const available = (cookie: string) =>
  read('/work/available', cookie, (body) => workAvailableSchema.parse(body).items);
const mine = (cookie: string) => read('/work', cookie, (body) => workMineSchema.parse(body));

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; detail?: unknown } }).error;
}

describe('work registry', () => {
  it('shows support the moderation items but not the desk', async () => {
    const items = await available(support);
    expect(items.map((item) => item.item_id)).toEqual([overdueReport, laterReport]);
    expect(items.every((item) => item.queue === 'moderation')).toBe(true);
    const all = await available(ops);
    expect(all.map((item) => item.item_id)).toEqual([overdueReport, deskTask, laterReport]);
  });

  it('claims into the source, refuses a second holder and sorts the overdue item first', async () => {
    for (const id of [laterReport, overdueReport]) {
      const claimed = await app.command(support, 'claim_work_item', {
        queue: 'moderation',
        item_id: id,
      });
      expect(claimed.status).toBe(200);
    }
    const { rows } = await harness.pool.query<{ assignee_admin_id: string }>(
      'SELECT assignee_admin_id FROM moderation_reports WHERE id = $1',
      [overdueReport],
    );
    expect(rows).toEqual([{ assignee_admin_id: supportUid }]);

    const taken = await app.command(ops, 'claim_work_item', {
      queue: 'moderation',
      item_id: overdueReport,
    });
    expect(taken.status).toBe(409);
    expect(await errorOf(taken)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'claimed', by: supportUid },
    });

    const work = await mine(support);
    expect(work.overdue.map((item) => item.item_id)).toEqual([overdueReport]);
    expect(work.due_soon).toEqual([]);
    expect(work.later.map((item) => item.item_id)).toEqual([laterReport]);
    expect(await available(support)).toEqual([]);
  });

  it('refuses a desk claim to support and a release by a non-holder', async () => {
    const denied = await app.command(support, 'claim_work_item', {
      queue: 'desk',
      item_id: deskTask,
    });
    expect(denied.status).toBe(403);
    const notMine = await app.command(ops, 'release_work_item', {
      queue: 'moderation',
      item_id: laterReport,
    });
    expect(await errorOf(notMine)).toMatchObject({ detail: { reason: 'not_holder' } });
  });

  it('counts a desk task assigned through the desk as mine and releases it', async () => {
    const claimed = await app.command(ops, 'claim_work_item', { queue: 'desk', item_id: deskTask });
    expect(claimed.status).toBe(200);
    expect((await mine(ops)).due_soon.map((item) => item.item_id)).toEqual([deskTask]);
    const released = await app.command(ops, 'release_work_item', {
      queue: 'desk',
      item_id: deskTask,
    });
    expect(released.status).toBe(200);
    expect((await mine(ops)).due_soon).toEqual([]);
    const { rows } = await harness.pool.query('SELECT assignee_admin_id FROM ops.concierge_tasks');
    expect(rows).toEqual([{ assignee_admin_id: null }]);
    expect(opsUid).toBeTruthy();
  });

  it('counts a closed item as done today', async () => {
    const target = await harness.pool.query<{ target_id: string }>(
      'SELECT target_id FROM moderation_reports WHERE id = $1',
      [overdueReport],
    );
    const decided = await app.command(support, 'moderate_item', {
      kind: 'user',
      id: target.rows[0]?.target_id,
      verdict: 'approve',
    });
    expect(decided.status).toBe(200);
    const work = await mine(support);
    expect(work.done_today).toBe(1);
    expect(work.overdue).toEqual([]);
  });
});
