/**
 * The expense card in crew chat reads the synced expense its message points at: who paid what for
 * what, how it splits, and a way into the expense; it names the viewer "You" when they paid.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router } from 'expo-router';

import type { ChatMessage } from '@/features/crew';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { deleteExpenseCommand } from '../../data/commands';
import { ExpenseChatCard } from '../expense-chat-card';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const LEO = '0192f000-0000-7000-8000-0000000000b2';
const EXPENSE = '0192f000-0000-7000-8000-0000000ee001';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

/** The viewer bound as the database owner, and the crewmates' names. */
async function seedCrew(s: TestLocalFirst) {
  await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    s.uid,
  ]);
  await s.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?)', [
    s.uid,
    'Rin',
    MAYA,
    'Maya Tran',
    LEO,
    'Leo',
  ]);
}

function renderChat(ui: ReactElement, s: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <GestureHandlerRootView>
        <LocalFirstProvider value={s.value}>{ui}</LocalFirstProvider>
      </GestureHandlerRootView>
    </I18nProvider>,
  );
}

function message(refId: string): ChatMessage {
  return {
    id: 'm-1',
    crewId: CREW,
    seq: 1,
    senderKind: 'user',
    senderId: MAYA,
    senderName: 'Maya Tran',
    guideId: null,
    type: 'expense',
    body: 'lunch',
    refKind: 'expense',
    refId,
    replyToId: null,
    mentions: [],
    mentionsGuide: false,
    attachments: [],
    edited: false,
    deleted: false,
    createdAt: '2026-09-30T10:00:00Z',
    status: 'sent',
  };
}

async function seedExpense(
  s: TestLocalFirst,
  input: {
    payer: string;
    description: string;
    splitMode: string;
    deleted?: boolean;
    sharers?: number;
  },
) {
  await s.db.execute(
    `INSERT INTO expenses (id, crew_id, trip_id, payer_id, amount_minor, currency, split_mode,
       category, description, merchant, deleted_at)
     VALUES (?, ?, 't-1', ?, 90000, 'USD', ?, 'food', ?, NULL, ?)`,
    [
      EXPENSE,
      CREW,
      input.payer,
      input.splitMode,
      input.description,
      input.deleted === true ? '2026-09-30T11:00:00Z' : null,
    ],
  );
  for (const [index, member] of [MAYA, s.uid, LEO].slice(0, input.sharers ?? 3).entries()) {
    await s.db.execute(
      `INSERT INTO expense_shares (id, expense_id, trip_id, user_id, computed_minor)
       VALUES (?, ?, 't-1', ?, 30000)`,
      [`share-${index}`, EXPENSE, member],
    );
  }
}

describe('expense card in crew chat', () => {
  it('says who paid what for what, how it splits, and opens the expense', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await seedExpense(stack, { payer: MAYA, description: 'lunch', splitMode: 'equal' });
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine={false} />, stack);
    expect(await screen.findByText(/^Maya Tran paid .*900.* for lunch$/u)).toBeTruthy();
    expect(screen.getByText(/^Split 3 ways · .*300.* each$/u)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`chat-expense-view-${EXPENSE}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/money/expense/[id]',
      params: { id: EXPENSE },
    });
  });

  it('names the viewer when they paid and leaves out what an untitled expense was for', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await seedExpense(stack, { payer: stack.uid, description: '', splitMode: 'weights' });
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine />, stack);
    expect(await screen.findByText(/^You paid .*900[^ ]*$/u)).toBeTruthy();
    expect(screen.getByText('Split 3 ways')).toBeTruthy();
  });

  it('shows no split for an expense only its payer shares', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await seedExpense(stack, { payer: MAYA, description: 'taxi', splitMode: 'equal', sharers: 1 });
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine={false} />, stack);
    expect(await screen.findByText(/^Maya Tran paid .*900.* for taxi$/u)).toBeTruthy();
    expect(screen.queryByText(/^Split/u)).toBeNull();
  });

  it('says so when the expense was deleted', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await seedExpense(stack, {
      payer: MAYA,
      description: 'lunch',
      splitMode: 'equal',
      deleted: true,
    });
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine={false} />, stack);
    expect(await screen.findByText('This expense was deleted')).toBeTruthy();
  });

  it('says who deleted it when the expense left the stream and only its edit history stayed', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    // A crewmate deleted a duplicate: the expense row is gone, its 'deleted' edit synced.
    await stack.db.execute(
      `INSERT INTO expense_edits (id, expense_id, trip_id, editor_id, kind, at)
       VALUES ('edit-1', ?, 't-1', ?, 'deleted', '2026-10-02T09:00:00Z')`,
      [EXPENSE, LEO],
    );
    await renderChat(
      <ExpenseChatCard message={{ ...message(EXPENSE), body: '' }} mine={false} />,
      stack,
    );
    expect(await screen.findByText('Leo deleted this expense')).toBeTruthy();
    expect(screen.queryByTestId(`chat-expense-view-${EXPENSE}`)).toBeNull();
  });

  it('names the viewer when they deleted it, and keeps what it was for', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await stack.db.execute(
      `INSERT INTO expense_edits (id, expense_id, trip_id, editor_id, kind, at)
       VALUES ('edit-1', ?, 't-1', ?, 'deleted', '2026-10-02T09:00:00Z')`,
      [EXPENSE, stack.uid],
    );
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine />, stack);
    expect(await screen.findByText('You deleted this expense')).toBeTruthy();
    expect(screen.getByText('lunch')).toBeTruthy();
  });

  it('holds a placeholder while the expense has not synced, then draws it', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine={false} />, stack);
    expect(await screen.findByTestId('chat-expense-loading-m-1')).toBeTruthy();
    await seedExpense(stack, { payer: MAYA, description: 'lunch', splitMode: 'equal' });
    expect(await screen.findByText(/^Maya Tran paid .*900.* for lunch$/u)).toBeTruthy();
  });

  it('says it was deleted when the message points at no expense', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await renderChat(
      <ExpenseChatCard message={{ ...message(EXPENSE), refId: null, body: '' }} mine={false} />,
      stack,
    );
    expect(await screen.findByText('This expense was deleted')).toBeTruthy();
  });

  it('shows the viewer’s own delete at once, while it is still queued', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    await seedExpense(stack, { payer: MAYA, description: 'lunch', splitMode: 'equal' });
    await renderChat(<ExpenseChatCard message={message(EXPENSE)} mine={false} />, stack);
    expect(await screen.findByText(/^Maya Tran paid .*900.* for lunch$/u)).toBeTruthy();
    // Offline: the delete waits in the queue and the synced expense is still there.
    await stack.value.commands.send(deleteExpenseCommand, { expense_id: EXPENSE });
    expect(await screen.findByText('You deleted this expense')).toBeTruthy();
    expect(screen.queryByTestId(`chat-expense-view-${EXPENSE}`)).toBeNull();
  });
});
