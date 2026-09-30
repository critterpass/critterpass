/**
 * Comments over the real local-first stack: a synced comment shows on its anchor only, my new
 * comment and my +1 are queued with the wire shape the api's comment commands take and show on
 * the thread at once, and undoing the guide's change queues `undo_guide_action`.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useComments } from '../use-comments';

configure({ asyncUtilTimeout: 5000 });

const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const ITEM = '0192f000-0000-7000-8000-0000000000e1';
const OTHER = '0192f000-0000-7000-8000-0000000000e2';
const JORDAN = '0192f000-0000-7000-8000-0000000000b2';
const ANCHOR = [{ kind: 'item' as const, id: ITEM }];

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

async function queued(s: TestLocalFirst, cmd: string): Promise<unknown[]> {
  const rows = await s.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ?',
    [cmd],
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

describe('plan comments', () => {
  it('queues a comment, a +1 and an undo, showing them on the thread at once', async () => {
    const s = await openTestLocalFirst({ holdUploads: true });
    stack = s;
    for (const [id, anchor] of [
      ['c-1', ITEM],
      ['c-2', OTHER],
    ]) {
      await s.db.execute(
        `INSERT INTO comments (id, trip_id, anchor_kind, anchor_id, author_id, body, created_at)
         VALUES (?, ?, 'item', ?, ?, 'After the rain?', '2026-10-14T01:00:00Z')`,
        [id, TRIP, anchor, JORDAN],
      );
    }
    const { result } = await renderHook(() => useComments(TRIP, s.uid), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.thread(ANCHOR).map((c) => c.id)).toEqual(['c-1']));

    await act(async () => {
      await result.current.plusOne('c-1', true);
      await result.current.addComment({ kind: 'item', id: ITEM }, '  Yes, after three  ');
      await result.current.undo('0192f000-0000-7000-8000-0000000000a9');
    });

    expect(await queued(s, 'plusone_comment')).toEqual([{ comment_id: 'c-1' }]);
    expect(await queued(s, 'add_comment')).toEqual([
      expect.objectContaining({
        trip_id: TRIP,
        target: { kind: 'item', id: ITEM },
        body: 'Yes, after three',
      }),
    ]);
    expect(await queued(s, 'undo_guide_action')).toEqual([
      { action_id: '0192f000-0000-7000-8000-0000000000a9' },
    ]);
    await waitFor(() => {
      const thread = result.current.thread(ANCHOR);
      expect(thread.map((c) => [c.body, c.plusOnes, c.queued])).toEqual([
        ['After the rain?', [s.uid], false],
        ['Yes, after three', [], true],
      ]);
    });
  });
});
