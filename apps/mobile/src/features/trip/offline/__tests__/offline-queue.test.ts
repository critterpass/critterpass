/**
 * The offline card's queue, on the real local-first stack: back online, lines tick in the order
 * the acks really arrive; cancelling a waiting write takes it out before upload and every screen
 * reads what it read before the tap (the pack list's query, an optimistic overlay row); a chat
 * message can have its text changed; anything already uploading is left alone.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { defineClientCommand } from '@/data/commands/summaries';
import { markCommandsDone } from '@/data/powersync/queue-store';
import {
  OVERLAY_CREWS,
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { listQueuedCommands } from '@/data/status/use-queued-commands';

import {
  buildPackChips,
  PENDING_PACKING_SQL,
  type PackingRow,
  type PendingPackingOp,
} from '../../day-of/packing-model';
import { checkPackingItemCommand } from '../../leave-by/commands';
import { cancelQueued, editQueuedMessage, queuedMessageBody } from '../queue-actions';
import { INITIAL_RECONNECT, stepReconnect } from '../reconnect-sequence';

const TRIP = '0192f000-0000-7000-8000-00000000f201';
const DAY = '2026-10-15';
const createCrew = defineClientCommand<{ name: string }>({ name: 'create_crew', offline: true });
const sendMessage = defineClientCommand<{ crew_id: string; body: string }>({
  name: 'send_message',
  offline: true,
});

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  return stack;
}

async function packChips(db: TestLocalFirst['db']) {
  const rows = await db.getAll<PackingRow>(
    'SELECT id, day, owner_id, label, checked, suggested_by, deleted_at FROM packing_items',
  );
  const pending = await db.getAll<PendingPackingOp>(PENDING_PACKING_SQL);
  return buildPackChips(rows, pending, TRIP, DAY);
}

describe('offline queue', () => {
  it('ticks each line in the order its ack arrives', async () => {
    const { db, value } = await open();
    const sent = [];
    for (const name of ['a', 'b', 'c']) {
      sent.push(await value.commands.send(createCrew, { name }));
    }
    const [first, second, third] = sent.map((result) => result.opId);
    let state = stepReconnect(INITIAL_RECONNECT, true, await listQueuedCommands(db));
    expect(state.items.map((item) => item.sent)).toEqual([false, false, false]);

    // Back online: the second op's ack lands first, then the third, then the first.
    state = stepReconnect(state, false, await listQueuedCommands(db));
    await db.writeTransaction((tx) => markCommandsDone(tx, [second ?? '']));
    state = stepReconnect(state, false, await listQueuedCommands(db));
    expect(state.acked).toEqual([second]);
    expect(state.phase).toBe('reconnecting');
    await db.execute('DELETE FROM commands WHERE id IN (?, ?)', [second ?? '', third ?? '']);
    state = stepReconnect(state, false, await listQueuedCommands(db));
    await db.execute('DELETE FROM commands WHERE id = ?', [first ?? '']);
    state = stepReconnect(state, false, await listQueuedCommands(db));
    expect(state.acked).toEqual([second, third, first]);
    expect(state.phase).toBe('back');
  });

  it('cancels a waiting write and the pack list reads as before the tap', async () => {
    const { db, value } = await open();
    await db.execute(
      `INSERT INTO packing_items (id, trip_id, day, owner_id, label, checked)
       VALUES ('lamp', ?, ?, NULL, 'Headlamp', 0)`,
      [TRIP, DAY],
    );
    const before = await packChips(db);
    const { opId } = await value.commands.send(checkPackingItemCommand, {
      item_id: 'lamp',
      checked: true,
    });
    expect((await packChips(db))[0]?.packed).toBe(true);
    expect(await cancelQueued(db, opId)).toBe('done');
    expect(await packChips(db)).toEqual(before);
    expect(await listQueuedCommands(db)).toEqual([]);
  });

  it('rolls back the optimistic rows of a cancelled write in the same transaction', async () => {
    const { db, value } = await open();
    const { opId } = await value.commands.send(
      createCrew,
      { name: 'Bali Six' },
      { optimistic: [{ table: OVERLAY_CREWS, row: { id: 'crew-1', name: 'Bali Six' } }] },
    );
    expect(await db.getAll(`SELECT id FROM ${OVERLAY_CREWS}`)).toEqual([{ id: 'crew-1' }]);
    await cancelQueued(db, opId);
    expect(await db.getAll(`SELECT id FROM ${OVERLAY_CREWS}`)).toEqual([]);
  });

  it("changes a waiting chat message's text, and leaves an uploading write alone", async () => {
    const { db, value } = await open();
    const { opId } = await value.commands.send(sendMessage, { crew_id: 'c', body: 'we made it' });
    expect(await editQueuedMessage(db, opId, 'we made it!!')).toBe('done');
    expect(await queuedMessageBody(db, opId)).toBe('we made it!!');

    await db.execute("UPDATE commands SET status = 'sending' WHERE id = ?", [opId]);
    expect(await cancelQueued(db, opId)).toBe('sending');
    expect(await editQueuedMessage(db, opId, 'nope')).toBe('sending');
    expect(await listQueuedCommands(db)).toHaveLength(1);
  });
});
