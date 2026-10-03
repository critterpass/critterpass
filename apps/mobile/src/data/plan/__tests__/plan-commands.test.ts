/**
 * The plan's command specs: the outbox words a queued plan edit exactly as each screen did before
 * there was one spec (a day reorder, any other edit, a place added from its screen, a proposal),
 * and a screen that needs the server's answer gets it from the online form of the same command,
 * while the offline form waits in the queue.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { ApplyPlanOpsPayload, CreateChangesetPayload, PlanOp } from '@cp/domain';

import { summarize } from '@/data/commands/summaries';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';

import {
  addPlaceToPlanCommand,
  applyChangesetCommand,
  applyChangesetOnline,
  applyPlanOpsCommand,
  createChangesetCommand,
  createChangesetOnline,
  proposePlaceCommand,
  sendChangesetCommand,
  sendChangesetOnline,
} from '../commands';

const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const ITEM = '0192f000-0000-7000-8000-0000000000e1';
const SET = '0192f000-0000-7000-8000-00000000c501';

const payload = (ops: PlanOp[]): ApplyPlanOpsPayload => ({
  trip_id: TRIP,
  base_version: V1,
  ops,
  confirm_locked: false,
});
const reorder: PlanOp = { op: 'reorder_days', new: { order: [2, 1, 3] } };
const move: PlanOp = { op: 'move', item: ITEM, new: { starts_at: '2026-10-14T06:00:00Z' } };
const add: PlanOp = {
  op: 'add',
  item: ITEM,
  new: { day_no: 3, starts_at: '2026-10-14T06:00:00Z', ends_at: '2026-10-14T07:30:00Z' },
};
const proposal: CreateChangesetPayload = {
  changeset_id: SET,
  trip_id: TRIP,
  base_version: V1,
  ops: [],
  source: 'user',
  trigger: 'manual',
};

describe('outbox wording', () => {
  it('reads a day reorder as the new day order and any other edit as a plan edit', () => {
    expect(summarize(applyPlanOpsCommand, payload([reorder]))?.message).toBe('New day order');
    expect(summarize(applyPlanOpsCommand, payload([move]))?.message).toBe('A plan edit');
    expect(summarize(applyPlanOpsCommand, payload([add]))?.message).toBe('A plan edit');
    expect(summarize(applyPlanOpsCommand, payload([reorder, move]))?.message).toBe('A plan edit');
  });

  it('reads a place added or suggested from its own screen as it did there', () => {
    expect(summarize(addPlaceToPlanCommand, payload([add]))?.message).toBe(
      'A place added to the plan',
    );
    expect(summarize(createChangesetCommand, proposal)?.message).toBe(
      'A change for the crew to okay',
    );
    expect(summarize(proposePlaceCommand, proposal)?.message).toBe('A place for the crew to okay');
  });

  it('keeps one command name per spec family, offline as the server accepts it', () => {
    expect(addPlaceToPlanCommand.name).toBe(applyPlanOpsCommand.name);
    expect(proposePlaceCommand.name).toBe(createChangesetCommand.name);
    for (const spec of [applyPlanOpsCommand, createChangesetCommand, sendChangesetCommand]) {
      expect(spec.offline).toBe(true);
    }
    for (const [online, offline] of [
      [createChangesetOnline, createChangesetCommand],
      [sendChangesetOnline, sendChangesetCommand],
      [applyChangesetOnline, applyChangesetCommand],
    ] as const) {
      expect(online).toEqual({ name: offline.name, offline: false });
    }
  });
});

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

describe('the server answer', () => {
  it('reaches a screen that sends the online form; the offline form is queued', async () => {
    const posted: string[] = [];
    // `POST /v1/cmd/create_changeset` as the api answers it (docs/api-contracts.md §2).
    const transport: SyncTransport = {
      postJson: (path) => {
        posted.push(path);
        return Promise.resolve({ status: 200, body: { result: { changeset_id: SET } } });
      },
    };
    stack = await openTestLocalFirst({ transport, holdUploads: true });
    const created = await stack.value.commands.send(createChangesetOnline, proposal);
    expect(created.kind).toBe('applied');
    expect(created.kind === 'applied' ? created.result : null).toEqual({ changeset_id: SET });
    expect(posted).toEqual(['/v1/cmd/create_changeset']);

    const queued = await stack.value.commands.send(createChangesetCommand, proposal);
    expect(queued.kind).toBe('queued');
    expect(posted).toHaveLength(1);
  });
});
