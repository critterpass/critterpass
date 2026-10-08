/**
 * Reconcile on synced `cmd_results`. The result rows are written into the local `cmd_results`
 * table the way the `me` sync stream delivers them (no PowerSync service runs in unit tests);
 * everything downstream — overlays, queue, rejected list — is the real code on a real database.
 */
import { afterEach, describe, expect, it } from '@jest/globals';

import {
  OVERLAY_CREWS,
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { eventually } from '../../powersync/test-support/queue-fixtures';
import { listQueuedCommands } from '../../status/use-queued-commands';
import { listRejectedCommands } from '../../status/use-rejected-commands';
import { reconcileOnce, startReconcile } from '../reconcile';
import { defineTestCommand } from '../test-support/test-command';

const createCrew = defineTestCommand<{ crew_id: string }>({
  name: 'create_test_crew',
  offline: true,
});

let stack: TestLocalFirst;

afterEach(async () => {
  await stack.close();
  removeDir(stack.dir);
});

async function sendWithOverlay(crewId: string): Promise<string> {
  const sent = await stack.value.commands.send(
    createCrew,
    { crew_id: crewId },
    { optimistic: [{ table: OVERLAY_CREWS, row: { id: crewId, name: 'Pending' } }] },
  );
  return sent.opId;
}

async function syncResult(
  opId: string,
  status: 'applied' | 'rejected' | 'duplicate',
  code: string | null = null,
  detail: unknown = null,
): Promise<void> {
  await stack.db.execute(
    `INSERT INTO cmd_results (id, op_id, uid, cmd, status, code, detail, server_ts)
     VALUES (?, ?, ?, 'create_test_crew', ?, ?, ?, ?)`,
    [
      opId,
      opId,
      stack.uid,
      status,
      code,
      detail === null ? null : JSON.stringify(detail),
      '2026-09-27T11:00:00.000Z',
    ],
  );
}

const overlayIds = async () =>
  (await stack.db.getAll<{ id: string }>(`SELECT id FROM ${OVERLAY_CREWS}`)).map((r) => r.id);

describe('reconcile', () => {
  it('drops the overlay and the queue entry once an applied result has synced', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const opId = await sendWithOverlay('crew-a');
    await sendWithOverlay('crew-b');
    await syncResult(opId, 'applied');

    expect(await reconcileOnce(stack.db)).toBe(1);

    expect(await overlayIds()).toEqual(['crew-b']);
    expect((await listQueuedCommands(stack.db)).map((q) => q.cmd)).toEqual(['create_test_crew']);
    expect(await listRejectedCommands(stack.db)).toEqual([]);
  });

  it('rolls the overlay back and lists the op when a rejected result syncs', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const opId = await sendWithOverlay('crew-a');
    await syncResult(opId, 'rejected', 'SEAT_LIMIT', { seat_cap: 8 });

    await reconcileOnce(stack.db);

    expect(await overlayIds()).toEqual([]);
    expect(await listQueuedCommands(stack.db)).toEqual([]);
    expect(await listRejectedCommands(stack.db)).toEqual([
      expect.objectContaining({
        opId,
        code: 'SEAT_LIMIT',
        messageKey: 'errors.SEAT_LIMIT',
        detail: { seat_cap: 8 },
        rejectedAt: '2026-09-27T11:00:00.000Z',
      }),
    ]);
  });

  it('treats a duplicate of a rejected op as rejected', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const opId = await sendWithOverlay('crew-a');
    await syncResult(opId, 'duplicate', 'STATE_INVALID');

    await reconcileOnce(stack.db);

    expect((await listRejectedCommands(stack.db)).map((r) => r.opId)).toEqual([opId]);
  });

  it('settles ops live as their results arrive', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const stop = startReconcile(stack.db);
    try {
      const opId = await sendWithOverlay('crew-a');
      await syncResult(opId, 'applied');
      await eventually(async () => (await listQueuedCommands(stack.db)).length === 0);
      expect(await overlayIds()).toEqual([]);
    } finally {
      stop();
    }
  });

  it('ignores results for ops this device no longer has queued', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await syncResult('0190f5a4-0000-7000-8000-0000000000ff', 'rejected', 'FORBIDDEN');
    expect(await reconcileOnce(stack.db)).toBe(0);
    expect(await listRejectedCommands(stack.db)).toEqual([]);
  });
});
