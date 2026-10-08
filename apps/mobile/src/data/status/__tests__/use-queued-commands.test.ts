/**
 * The queued list is read from the encrypted database itself, so it survives the app being killed
 * and reopened, in the original order and with its summaries; the hook follows every change.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { defineClientCommand } from '../../commands/summaries';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { listQueuedCommands, useQueuedCommands } from '../use-queued-commands';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const uploadPhotos = defineClientCommand({
  name: 'register_photo',
  offline: true,
  summarize: (payload: { count: number; album: string }) => ({
    id: 'album.queued.upload',
    message: '{count} photos → {album}',
    values: payload,
  }),
});
const castVote = defineClientCommand({
  name: 'cast_ballot',
  offline: true,
  summarize: (payload: { option: string }) => ({
    id: 'polls.queued.vote',
    message: 'Your vote: {option}',
    values: payload,
  }),
});
const nudge = defineClientCommand<Record<string, never>>({ name: 'send_nudge', offline: true });

const stacks: TestLocalFirst[] = [];
async function open(options: Parameters<typeof openTestLocalFirst>[0] = {}) {
  const stack = await openTestLocalFirst(options);
  stacks.push(stack);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

describe('queued commands', () => {
  it('survive closing and reopening the database, in order, with their summaries', async () => {
    const first = await open();
    await first.value.commands.send(uploadPhotos, { count: 12, album: 'crew album' });
    await first.value.commands.send(castVote, { option: 'Nusa Penida' });
    await first.value.commands.send(nudge, {});
    // Offline: every upload attempt is refused, so all three stay queued.
    await first.value.queue.flush();
    const before = await listQueuedCommands(first.db);
    await first.close();

    const reopened = await open({ dir: first.dir, key: first.key, uid: first.uid });
    const after = await listQueuedCommands(reopened.db);

    expect(after).toEqual(before);
    expect(after.map((item) => [item.cmd, item.status, item.summary])).toEqual([
      [
        'register_photo',
        'queued',
        {
          id: 'album.queued.upload',
          message: '{count} photos → {album}',
          values: { count: 12, album: 'crew album' },
        },
      ],
      [
        'cast_ballot',
        'queued',
        {
          id: 'polls.queued.vote',
          message: 'Your vote: {option}',
          values: { option: 'Nusa Penida' },
        },
      ],
      ['send_nudge', 'queued', { id: 'send_nudge', message: 'send_nudge' }],
    ]);
  });

  it('are followed live by useQueuedCommands', async () => {
    const stack = await open({ holdUploads: true });
    const { result } = await renderHook(() => useQueuedCommands(), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current).toEqual([]));

    let opId = '';
    await act(async () => {
      opId = (await stack.value.commands.send(castVote, { option: 'Ubud' })).opId;
    });
    await waitFor(() =>
      expect(result.current).toEqual([expect.objectContaining({ opId, status: 'queued' })]),
    );

    await act(() => stack.db.execute(`UPDATE commands SET status = 'done' WHERE id = ?`, [opId]));
    await waitFor(() => expect(result.current[0]?.status).toBe('done'));
  });
});
