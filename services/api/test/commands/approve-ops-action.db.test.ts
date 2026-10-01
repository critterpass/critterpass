/**
 * `approve_ops_action` through the app's `/v1/cmd` door: the requester approves the exact text for
 * their own task (stored verbatim with the command's op_id and linked to the task); nobody else can,
 * unknown subject kinds are refused, and a replayed op_id never writes a second approval.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from '../admin/harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let requester: AppUser;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  requester = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function task(): Promise<string> {
  const response = await app.command(ops, 'create_concierge_task', {
    kind: 'vendor_message',
    requested_by: requester.uid,
  });
  return ((await response.json()) as { result: { id: string } }).result.id;
}

function approve(user: AppUser, subjectId: string, text: string, opId?: string) {
  return app.userCommand(
    user,
    'approve_ops_action',
    { subject_kind: 'concierge_task', subject_id: subjectId, text_shown: text },
    opId,
  );
}

describe('approve_ops_action', () => {
  it('stores the exact text with the op_id and links it to the task, once per op_id', async () => {
    const id = await task();
    const text = '  Xin chào! Please confirm 2 rooms, 3 nights from 12 Oct.\nThanks — Mai  ';
    const opId = generateUuidV7();
    const first = await approve(requester, id, text, opId);
    expect(first.status).toBe(200);
    const replay = await approve(requester, id, text, opId);
    expect(await replay.json()).toMatchObject({ status: 'duplicate' });

    const { rows } = await harness.pool.query<{
      id: string;
      user_id: string;
      text_shown: string;
      op_id: string;
    }>('SELECT id, user_id, text_shown, op_id FROM ops.approvals WHERE subject_id = $1', [id]);
    expect(rows).toEqual([
      { id: expect.any(String) as string, user_id: requester.uid, text_shown: text, op_id: opId },
    ]);
    const linked = await harness.pool.query<{ approval_id: string }>(
      'SELECT approval_id FROM ops.concierge_tasks WHERE id = $1',
      [id],
    );
    expect(linked.rows[0]?.approval_id).toBe(rows[0]?.id);
  });

  it("refuses another user's task and an unknown subject kind", async () => {
    const id = await task();
    const stranger = await harness.signInUser();
    expect((await approve(stranger, id, 'Looks good')).status).toBe(404);
    const unknown = await app.userCommand(requester, 'approve_ops_action', {
      subject_kind: 'spaceship',
      subject_id: id,
      text_shown: 'Go',
    });
    expect(unknown.status).toBe(422);
    const { rows } = await harness.pool.query('SELECT 1 FROM ops.approvals WHERE subject_id = $1', [
      id,
    ]);
    expect(rows).toEqual([]);
  });
});
