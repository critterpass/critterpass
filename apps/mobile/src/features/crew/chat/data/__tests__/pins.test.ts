/**
 * Pins on the real local-first stack: synced pins list newest first, a pin or unpin queued on this
 * device shows at once and the last queued one wins, and tombstoned messages drop out.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { loadPins, usePins } from '../use-pins';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const id = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function message(
  stack: TestLocalFirst,
  n: number,
  body: string,
  pinnedAt: string | null,
  deletedAt: string | null = null,
) {
  await stack.db.execute(
    `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body, mentions,
       mentions_guide, attachments, pinned_at, deleted_at, created_at)
     VALUES (?, ?, ?, 'user', ?, 'text', ?, '[]', 0, '[]', ?, ?, '2026-10-10T08:00:00Z')`,
    [id(n), CREW, n, MAYA, body, pinnedAt, deletedAt],
  );
}

describe('pins', () => {
  it('lists synced pins newest first and applies queued pins and unpins at once', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await message(stack, 1, 'Boat at 8, gate 3', '2026-10-10T09:00:00Z');
    await message(stack, 2, 'Villa code 4417', '2026-10-10T10:00:00Z');
    await message(stack, 3, 'Sunset at 18:10', null);
    await message(stack, 4, 'gone', '2026-10-10T11:00:00Z', '2026-10-10T12:00:00Z');
    expect((await loadPins(stack.db, CREW)).map((pin) => pin.body)).toEqual([
      'Villa code 4417',
      'Boat at 8, gate 3',
    ]);

    const { result } = await renderHook(() => usePins(CREW), { wrapper: stack.wrapper });
    await result.current.setPinned(id(3), true);
    await result.current.setPinned(id(2), true);
    await result.current.setPinned(id(2), false);
    expect((await loadPins(stack.db, CREW)).map((pin) => pin.body)).toEqual([
      'Sunset at 18:10',
      'Boat at 8, gate 3',
    ]);
  });
});
