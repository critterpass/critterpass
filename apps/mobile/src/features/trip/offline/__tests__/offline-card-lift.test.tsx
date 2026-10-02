/**
 * The hub's offline card through a reconnect, on the real local-first stack: once every queued
 * line has ticked, "Back online" holds a moment and the card lifts, even while the acknowledged
 * ops are still leaving the queue (their results sync down a little later, one at a time).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { markCommandsDone } from '@/data/powersync/queue-store';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useOffline } from '../use-offline';

const TRIP = '0192f000-0000-7000-8000-00000000f301';
const createCrew = defineClientCommand<{ name: string }>({ name: 'create_crew', offline: true });

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('the offline card through a reconnect', () => {
  it('lifts after "Back online" while the sent ops are still leaving the queue', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { db, network, value, wrapper: LocalFirst } = stack;
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>
        <LocalFirst>{children}</LocalFirst>
      </I18nProvider>
    );
    const opIds: string[] = [];
    for (const name of ['a', 'b', 'c']) {
      opIds.push((await value.commands.send(createCrew, { name })).opId);
    }
    const { result } = await renderHook(() => useOffline(TRIP), { wrapper });

    await act(() => network.set(false));
    await waitFor(() => expect(result.current?.card.chip).toBe('offline'));
    await waitFor(() => expect(result.current?.sends).toHaveLength(3));

    // Back online: the server acknowledges all three, so every line ticks.
    await act(() => network.set(true));
    await act(() => db.writeTransaction((tx) => markCommandsDone(tx, opIds)));
    await waitFor(() => expect(result.current?.card.chip).toBe('back'));

    // The first result syncs down and its op leaves; the other two are still on their way.
    await act(() => db.execute('DELETE FROM commands WHERE id = ?', [opIds[0] ?? '']));

    await waitFor(() => expect(result.current).toBeNull(), { timeout: 4000 });
  });
});
