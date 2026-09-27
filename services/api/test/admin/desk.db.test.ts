/**
 * The concierge desk: tasks listed soonest-due first with SLA bands, the status machine and
 * optimistic concurrency on updates, and the approval gate — an outbound task cannot be completed,
 * and `assertApproved` refuses, until the user approved that exact subject.
 */
import { withSystem } from '@cp/db';
import { DomainError, deskResponseSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertApproved } from '../../src/admin/desk';
import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let traveller: AppUser;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  traveller = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function create(payload: Record<string, unknown>): Promise<string> {
  const response = await app.command(ops, 'create_concierge_task', payload);
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: { id: string } }).result.id;
}

async function desk(status = 'new') {
  const response = await app.request(`/v1/admin/desk?status=${status}`, {
    headers: { cookie: ops },
  });
  expect(response.status).toBe(200);
  return deskResponseSchema.parse(await response.json()).items;
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error?: { code?: string } }).error?.code;
}

describe('desk queue', () => {
  it('lists tasks by due time with SLA bands, one audit row per create', async () => {
    const later = await create({ kind: 'review', due_at: inMinutes(600) });
    const undated = await create({ kind: 'review' });
    const overdue = await create({
      kind: 'clinic_handoff',
      due_at: inMinutes(-5),
      note: 'Call vet',
    });
    const soon = await create({ kind: 'partner_booking', due_at: inMinutes(30) });

    const items = (await desk()).filter((item) =>
      [later, undated, overdue, soon].includes(item.id),
    );
    expect(items.map((item) => item.id)).toEqual([overdue, soon, later, undated]);
    expect(items.map((item) => item.sla)).toEqual(['overdue', 'due_soon', 'ok', 'none']);
    expect(items[0]?.notes).toEqual([
      expect.objectContaining({ admin: 'ops@critterpass.test', text: 'Call vet' }),
    ]);
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM ops.admin_audit WHERE action = 'create_concierge_task' AND target_id = $1",
      [overdue],
    );
    expect(rows).toHaveLength(1);

    const summary = await app.request('/v1/admin/desk/summary', { headers: { cookie: ops } });
    expect(await summary.json()).toMatchObject({ due_soon: 2 });
  });

  it('assigns, notes and moves a task; rejects stale versions and illegal moves', async () => {
    const id = await create({ kind: 'review', due_at: inMinutes(60) });
    const taken = await app.command(ops, 'update_concierge_task', {
      id,
      version: 1,
      assignee: 'self',
      status: 'in_progress',
      note: 'On it',
    });
    expect(await taken.json()).toMatchObject({ result: { status: 'in_progress', version: 2 } });
    const mine = (await desk('in_progress')).find((item) => item.id === id);
    expect(mine).toMatchObject({ assigned_to_me: true, assignee: 'ops@critterpass.test' });

    const stale = await app.command(ops, 'update_concierge_task', { id, version: 1, note: 'Late' });
    expect(await errorCode(stale)).toBe('VERSION_CONFLICT');
    const backwards = await app.command(ops, 'update_concierge_task', {
      id,
      version: 2,
      status: 'new',
    });
    expect(backwards.status).toBe(409);
    expect(await errorCode(backwards)).toBe('STATE_INVALID');
    const done = await app.command(ops, 'update_concierge_task', {
      id,
      version: 2,
      status: 'done',
    });
    expect(done.status).toBe(200);
  });

  it('keeps support out of the desk', async () => {
    const support = await app.signIn('support@critterpass.test');
    expect((await app.request('/v1/admin/desk', { headers: { cookie: support } })).status).toBe(
      403,
    );
    const denied = await app.command(support, 'create_concierge_task', { kind: 'review' });
    expect(denied.status).toBe(403);
  });
});

describe('approval gate', () => {
  it('an outbound task completes only after the user approved its exact text', async () => {
    const id = await create({ kind: 'vendor_message', requested_by: traveller.uid });
    await app.command(ops, 'update_concierge_task', { id, version: 1, status: 'in_progress' });
    const blocked = await app.command(ops, 'update_concierge_task', {
      id,
      version: 2,
      status: 'done',
    });
    expect(blocked.status).toBe(409);
    expect(await errorCode(blocked)).toBe('APPROVAL_REQUIRED');

    const text = 'Hi! Could you hold a table for 4 at 19:30 on Friday? — Mai (via CritterPass)';
    const approved = await app.userCommand(traveller, 'approve_ops_action', {
      subject_kind: 'concierge_task',
      subject_id: id,
      text_shown: text,
    });
    expect(approved.status).toBe(200);
    const card = (await desk('in_progress')).find((item) => item.id === id);
    expect(card?.approval).toMatchObject({ text_shown: text });
    expect(card?.requester_name).toBeNull();

    const done = await app.command(ops, 'update_concierge_task', {
      id,
      version: card?.version,
      status: 'done',
    });
    expect(done.status).toBe(200);
  });

  it('assertApproved throws APPROVAL_REQUIRED without a row and passes with one', async () => {
    const id = await create({ kind: 'partner_booking', requested_by: traveller.uid });
    const check = (userId?: string) =>
      withSystem(harness.pool, (tx) =>
        assertApproved(tx, { kind: 'concierge_task', id, ...(userId ? { userId } : {}) }),
      );
    await expect(check()).rejects.toSatisfy(
      (error: unknown) => error instanceof DomainError && error.code === 'APPROVAL_REQUIRED',
    );
    await app.userCommand(traveller, 'approve_ops_action', {
      subject_kind: 'concierge_task',
      subject_id: id,
      text_shown: 'Book the 10:00 snorkel trip for 2',
    });
    await expect(check()).resolves.toMatchObject({
      userId: traveller.uid,
      textShown: 'Book the 10:00 snorkel trip for 2',
    });
    const stranger = await harness.signInUser();
    await expect(check(stranger.uid)).rejects.toThrow();
  });
});
