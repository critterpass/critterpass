/**
 * Synced settings over the real local-first stack: a change shows at once and waits in the
 * offline queue as `set_settings` with only the changed column, and a row synced from another
 * phone shows without reopening Settings. The Help share answer queues `set_consent` likewise.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { pendingEdits, resetPendingEdits } from '../../data/pending-edits';
import { useHelpShareConsent } from '../help-share-consent';
import { useSyncedSettings } from '../use-synced-settings';

configure({ asyncUtilTimeout: 5000 });

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  resetPendingEdits();
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  return stack;
}

async function queued(stack: TestLocalFirst, cmd: string): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq',
    [cmd],
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

describe('synced settings on this phone', () => {
  it('queues only the changed column and shows the change at once', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useSyncedSettings(), { wrapper: stack.wrapper });
    await act(() => result.current.change({ hideCollection: true, chattiness: 'normal' }));
    expect(result.current.settings.hideCollection).toBe(true);
    await waitFor(async () =>
      expect(await queued(stack, 'set_settings')).toEqual([{ patch: { hide_collection: true } }]),
    );
  });

  it('keeps an unsent change when the screen is left and opened again, until the row agrees', async () => {
    const stack = await open();
    const first = await renderHook(() => useSyncedSettings(), { wrapper: stack.wrapper });
    await act(() => first.result.current.change({ hideLockscreenDetails: true }));
    await first.unmount();

    const again = await renderHook(() => useSyncedSettings(), { wrapper: stack.wrapper });
    expect(again.result.current.settings.hideLockscreenDetails).toBe(true);

    // The server's row arrives saying the same: the row is the truth again, and a later change
    // from another phone shows.
    await stack.db.execute(
      'INSERT INTO user_settings (id, user_id, hide_lockscreen_details) VALUES (?, ?, 1)',
      [stack.uid, stack.uid],
    );
    await waitFor(() => expect(pendingEdits('settings')).toEqual({}));
    await stack.db.execute('UPDATE user_settings SET hide_lockscreen_details = 0 WHERE id = ?', [
      stack.uid,
    ]);
    await waitFor(() => expect(again.result.current.settings.hideLockscreenDetails).toBe(false));
    await again.unmount();
  });

  it('shows what another phone saved once its row syncs', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useSyncedSettings(), { wrapper: stack.wrapper });
    expect(result.current.settings.chattiness).toBe('normal');
    await stack.db.execute(
      "INSERT INTO user_settings (id, user_id, chattiness, talk_out_loud) VALUES (?, ?, 'quiet', 1)",
      [stack.uid, stack.uid],
    );
    await waitFor(() => expect(result.current.settings.chattiness).toBe('quiet'));
    expect(result.current.settings.talkOutLoud).toBe(true);
  });

  it('queues the Help share answer as a consent the traveller can take back', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useHelpShareConsent(), { wrapper: stack.wrapper });
    expect(result.current.on).toBe(false);
    await act(() => result.current.set(true));
    expect(result.current.on).toBe(true);
    await act(() => result.current.set(false));
    await waitFor(async () =>
      expect(await queued(stack, 'set_consent')).toEqual([
        { purpose: 'help_auto_share', granted: true, copy_version: 'settings-help-share-1' },
        { purpose: 'help_auto_share', granted: false, copy_version: 'settings-help-share-1' },
      ]),
    );
  });
});
