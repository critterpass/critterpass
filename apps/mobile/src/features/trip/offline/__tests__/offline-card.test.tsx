/**
 * The hub's offline card on the real local-first stack. SENDS WHEN YOU'RE BACK lists only what the
 * traveller did, in the catalogs' words; the app's own bookkeeping never shows, and with nothing
 * else waiting the section is gone. Through a reconnect, once every line has ticked, "Back
 * online" holds a moment and the card lifts, even while the acknowledged ops are still leaving
 * the queue (their results sync down a little later, one at a time).
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
import { msg } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AddExpensePayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';
import { markCommandsDone } from '@/data/powersync/queue-store';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useOffline } from '../use-offline';

const TRIP = '0192f000-0000-7000-8000-00000000f301';
const ME = '0192f000-0000-7000-8000-00000000f3a1';
/** A traveller's change, described as the money feature describes it. */
const addExpenseCommand = defineClientCommand<AddExpensePayload>({
  name: 'add_expense',
  offline: true,
  summarize: (payload) =>
    payload.description === ''
      ? msg({ id: 'money.queued.addExpenseNoName', message: 'A new expense' })
      : msg({ id: 'money.queued.addExpense', message: `Expense: ${payload.description}` }),
});
/** The app's own bookkeeping, declared as their features declare them: no summary. */
const recordAppOpen = defineClientCommand<Record<string, never>>({
  name: 'record_app_open',
  offline: true,
});
const updatePermissions = defineClientCommand<{ perms: Record<string, string> }>({
  name: 'update_device_permissions',
  offline: true,
});

function expense(n: number, description: string): AddExpensePayload {
  return {
    expense_id: `0192f000-0000-7000-8000-0000000000${String(10 + n)}`,
    trip_id: TRIP,
    amount_minor: 120_000,
    currency: 'VND',
    fx_snapshot_id: null,
    payer_uid: ME,
    split: { mode: 'equal', shares: [{ user_id: ME }] },
    category: 'food',
    description,
  };
}

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function renderCard() {
  const opened = await openTestLocalFirst({ holdUploads: true });
  stack = opened;
  const { wrapper: LocalFirst } = opened;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <LocalFirst>{children}</LocalFirst>
    </I18nProvider>
  );
  const { result } = await renderHook(() => useOffline(TRIP), { wrapper });
  await act(() => opened.network.set(false));
  await waitFor(() => expect(result.current?.card.chip).toBe('offline'));
  return { result, opened };
}

describe('what the offline card lists', () => {
  it('lists what the traveller did in the catalogs’ words, never the app’s bookkeeping', async () => {
    const { result, opened } = await renderCard();
    const { commands } = opened.value;
    await commands.send(recordAppOpen, {});
    await commands.send(addExpenseCommand, expense(1, 'Grab to My Khe beach'));
    await commands.send(updatePermissions, { perms: { notifications: 'granted' } });
    await commands.send(addExpenseCommand, expense(2, ''));

    await waitFor(() => expect(result.current?.sends).toHaveLength(2));
    expect(result.current?.sends.map((line) => i18n._(line.summary))).toEqual([
      'Expense: Grab to My Khe beach',
      'A new expense',
    ]);
  });

  it('hides the section when only the app’s bookkeeping is waiting', async () => {
    const { result, opened } = await renderCard();
    const { commands, db } = opened.value;
    await commands.send(recordAppOpen, {});
    await commands.send(updatePermissions, { perms: { notifications: 'granted' } });
    await waitFor(async () => expect(await db.getAll('SELECT id FROM commands')).toHaveLength(2));

    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(result.current?.sends).toEqual([]);
  });
});

describe('the offline card through a reconnect', () => {
  it('lifts after "Back online" while the sent ops are still leaving the queue', async () => {
    const { result, opened } = await renderCard();
    const { db, network, value } = opened;
    const opIds: string[] = [];
    for (const [n, what] of ['Dinner', 'Grab', 'Coffee'].entries()) {
      opIds.push((await value.commands.send(addExpenseCommand, expense(n, what))).opId);
    }
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
