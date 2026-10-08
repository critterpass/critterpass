/**
 * A money write the server refuses says so, over the real local-first stack. ADD answers at once
 * and the expense is listed as pending; the server's refusal arrives later with the synced
 * results, the queue rolls the expense back, and the person is told what was not saved and why. A
 * refusal of a write made while online is then cleared; one that waited with no signal stays for
 * the trip's "didn't go through" list.
 */

import { generateUuidV7, type AddExpensePayload } from '@cp/domain';
import { afterEach, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { reconcileOnce } from '@/data/commands/reconcile';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { errorMessage } from '@/lib/errors/error-messages';
import { toast, toastQueue } from '@/motion/island-toast';

import { addExpenseCommand, markPaidCommand } from '../commands';
import { refusalReason, toRefusedMoneyWrite } from '../refused-writes';
import { useRefusedMoneyWrites } from '../use-refused-money-writes';
import { useTripMoney } from '../use-trip-money';

const ME = '0199a6f0-0000-7000-8000-00000000f001';
const KHOA = '0199a6f0-0000-7000-8000-00000000f003';
const CREW = '0199a6f0-0000-7000-8000-00000000f101';
const TRIP = '0199a6f0-0000-7000-8000-00000000f201';

/** The server's answer to a split that names someone who has left the trip. */
const SOMEONE_LEFT = { reason: 'not_in_trip', user_ids: [KHOA] };

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  toast.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function expense(): AddExpensePayload {
  return {
    expense_id: generateUuidV7(),
    trip_id: TRIP,
    amount_minor: 600_000,
    currency: 'VND',
    fx_snapshot_id: null,
    payer_uid: ME,
    split: {
      mode: 'weights',
      shares: [
        { user_id: ME, weight: 1 },
        { user_id: KHOA, weight: 1 },
      ],
    },
    category: 'other',
    description: 'Boat',
  };
}

/** Money open on the trip, with the hook that says refusals mounted as every money screen has it. */
async function openMoney() {
  stack = await openTestLocalFirst({ uid: ME, holdUploads: true });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const Local = stack.wrapper;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <Local>{children}</Local>
    </I18nProvider>
  );
  const { result } = await renderHook(
    () => {
      useRefusedMoneyWrites();
      return useTripMoney(CREW, TRIP);
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.loaded).toBe(true));
  return { stack, result };
}

/** The server's refusal as it reaches the phone: a synced result row, settled by the reconcile. */
async function refuse(
  db: TestLocalFirst['db'],
  opId: string,
  code: string,
  detail: unknown,
): Promise<void> {
  await db.execute(
    `INSERT INTO cmd_results (id, status, code, detail, server_ts)
     VALUES (?, 'rejected', ?, ?, '2026-10-08T15:14:00Z')`,
    [opId, code, JSON.stringify(detail)],
  );
  await reconcileOnce(db);
}

async function refusalsLeft(db: TestLocalFirst['db']): Promise<string[]> {
  const rows = await db.getAll<{ id: string }>('SELECT id FROM rejected_commands');
  return rows.map((row) => row.id);
}

describe('a queued expense the server refuses', () => {
  it('leaves the list and says what was not added and why, once', async () => {
    const { stack: open, result } = await openMoney();
    const sent = await open.value.commands.send(addExpenseCommand, expense());
    expect(sent.kind).toBe('queued');
    await waitFor(() => expect(result.current.pending).toHaveLength(1));

    await refuse(open.db, sent.opId, 'VALIDATION', SOMEONE_LEFT);

    // Rolled back: the pending expense is gone from Money.
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe(`money-refused-${sent.opId}`));
    expect(toastQueue.getCurrent()).toMatchObject({
      title: "Your expense wasn't added",
      subtitle: 'Someone in it is no longer on this trip. Add it again without them.',
      // Long enough to read: the same time a toast with an action stays.
      durationMs: 6000,
    });
    // Said, so it does not wait in the refusal list to be said again.
    await waitFor(async () => expect(await refusalsLeft(open.db)).toEqual([]));
  });

  it('keeps a refusal of a write that waited with no signal for the trip’s list', async () => {
    const { stack: open } = await openMoney();
    const sent = await open.value.commands.send(addExpenseCommand, expense());
    // The trip's offline view marks the writes that waited while there was no signal.
    await open.db.execute(
      `INSERT INTO local_private (id, kind, data, fetched_at)
       VALUES (?, 'offline_send', '{}', '2026-10-08T15:00:00Z')`,
      [sent.opId],
    );

    await refuse(open.db, sent.opId, 'VALIDATION', SOMEONE_LEFT);

    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe(`money-refused-${sent.opId}`));
    expect(await refusalsLeft(open.db)).toEqual([sent.opId]);
  });

  it('says a refused payment mark with the line for its error code', async () => {
    const { stack: open } = await openMoney();
    const sent = await open.value.commands.send(markPaidCommand, {
      payment_id: generateUuidV7(),
      method: 'cash',
    });

    await refuse(open.db, sent.opId, 'VERSION_CONFLICT', { current_version: 3 });

    await waitFor(() => expect(toastQueue.getCurrent()?.id).toBe(`money-refused-${sent.opId}`));
    expect(toastQueue.getCurrent()).toMatchObject({
      title: "The payment wasn't marked paid",
      subtitle: 'Someone changed this first. Take a look and try again.',
    });
  });
});

describe('why a money write was refused', () => {
  it('names the cause when someone in the split, or the sender, has left the trip', () => {
    const detail = JSON.stringify(SOMEONE_LEFT);
    expect(refusalReason('VALIDATION', detail).id).toBe('money.refused.someoneLeft');
    expect(refusalReason('NOT_ELIGIBLE', JSON.stringify({ reason: 'not_in_trip' })).id).toBe(
      'money.refused.youLeft',
    );
  });

  it('falls back to the line for the error code, whatever the detail holds', () => {
    expect(refusalReason('VALIDATION', JSON.stringify({ reason: 'more_than_owed' }))).toBe(
      errorMessage('VALIDATION'),
    );
    expect(refusalReason('STATE_INVALID', null)).toBe(errorMessage('STATE_INVALID'));
    expect(refusalReason('NOT_FOUND', 'not json')).toBe(errorMessage('NOT_FOUND'));
  });

  it('has a line for a command it does not know', () => {
    const write = toRefusedMoneyWrite({
      id: 'op',
      cmd: 'request_payment',
      code: 'FORBIDDEN',
      detail: null,
      waited_offline: 0,
    });
    expect(write.title.id).toBe('money.refused.other');
    expect(write.keptForTrip).toBe(false);
  });
});
