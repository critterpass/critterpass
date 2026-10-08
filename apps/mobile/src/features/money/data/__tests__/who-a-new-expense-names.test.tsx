/**
 * Who a new expense can name, over the real local-first stack. A crewmate removed from the crew
 * gives their seat up (`rsvp = 'out'`) and the server refuses any new expense that names them, so
 * the keypad must not offer them as payer or give them a share; the expenses they were already
 * part of keep their share. Seats are read as they reach the phone: `holds_seat` is generated on
 * the server and arrives empty.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { newDraft, toAddPayload } from '../../add-expense/draft';
import { draftFromExpense } from '../../add-expense/preview';
import { buildBalances } from '../../balances/model';
import { useMoneyContext } from '../use-money-context';
import { useTripMoney } from '../use-trip-money';

const ME = '0199a6f0-0000-7000-8000-00000000e001';
const MAYA = '0199a6f0-0000-7000-8000-00000000e002';
const KHOA = '0199a6f0-0000-7000-8000-00000000e003';
const FRIEND = '0199a6f0-0000-7000-8000-00000000e004';
const CREW = '0199a6f0-0000-7000-8000-00000000e101';
const TRIP = '0199a6f0-0000-7000-8000-00000000e201';
const LUNCH = '0199a6f0-0000-7000-8000-00000000e301';
const NEW_EXPENSE = '0199a6f0-0000-7000-8000-00000000e302';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

interface Person {
  readonly uid: string;
  /** The crew membership as it synced. */
  readonly status: 'active' | 'removed' | 'left';
  /** The seat as it synced. */
  readonly rsvp: 'in' | 'out' | 'waitlisted';
  readonly name?: string;
}

/** Me and Maya, then Khoa and a friend as given, on a trip under way that settles in đồng. */
async function seed(db: TestLocalFirst['db'], people: readonly Person[]): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    ME,
  ]);
  await db.execute(`INSERT INTO crews (id, name, settlement_currency) VALUES (?, 'Crew', 'VND')`, [
    CREW,
  ]);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, local_currency, tz)
     VALUES (?, ?, 'in_trip', 'VND', 'Asia/Ho_Chi_Minh')`,
    [TRIP, CREW],
  );
  for (const [index, person] of people.entries()) {
    const at = `2026-09-0${index + 1}T00:00:00Z`;
    // The profile of someone who left no longer syncs to the crew.
    if (person.name !== undefined) {
      await db.execute(
        `INSERT INTO users (id, display_name, home_currency, home_country) VALUES (?, ?, 'VND', 'VN')`,
        [person.uid, person.name],
      );
    }
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `m-${person.uid}`,
        CREW,
        person.uid,
        person.status,
        person.uid === ME ? 'organiser' : 'member',
        at,
      ],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, holds_seat, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [`p-${person.uid}`, TRIP, person.uid, person.rsvp, at],
    );
  }
  // A ₫300,000 lunch I paid before Khoa left, split three ways.
  await db.execute(
    `INSERT INTO expenses (id, crew_id, trip_id, payer_id, amount_minor, currency,
       crew_amount_minor, crew_currency, split_mode, category, description, local_date, trip_day,
       spent_at, source, created_by, version, created_at)
     VALUES (?, ?, ?, ?, 300000, 'VND', 300000, 'VND', 'equal', 'food', 'Lunch', '2026-10-02', 1,
       '2026-10-02T02:23:16Z', 'manual', ?, 1, '2026-10-02T02:23:16Z')`,
    [LUNCH, CREW, TRIP, ME, ME],
  );
  for (const uid of [ME, MAYA, KHOA]) {
    await db.execute(
      `INSERT INTO expense_shares (id, expense_id, trip_id, user_id, weight, computed_minor,
         crew_computed_minor)
       VALUES (?, ?, ?, ?, 1, 100000, 100000)`,
      [`s-${uid}`, LUNCH, TRIP, uid],
    );
  }
  for (const debtor of [MAYA, KHOA]) {
    await db.execute(
      `INSERT INTO ledger_entries (id, crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency)
       VALUES (?, ?, ?, ?, ?, 100000, 'VND')`,
      [`l-${debtor}`, CREW, TRIP, debtor, ME],
    );
  }
}

async function openMoney(people: readonly Person[]) {
  stack = await openTestLocalFirst({ uid: ME });
  await seed(stack.db, people);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const Local = stack.wrapper;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <Local>{children}</Local>
    </I18nProvider>
  );
  const { result } = await renderHook(
    () => {
      const ctx = useMoneyContext();
      const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
      return { ctx, rows };
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.ctx.status).toBe('ready'));
  await waitFor(() => expect(result.current.rows.shares).toHaveLength(3));
  await waitFor(() => expect(result.current.ctx.members).toHaveLength(people.length));
  return result;
}

const WINSTON: Person = { uid: ME, status: 'active', rsvp: 'in', name: 'Winston' };
const MAYA_IN: Person = { uid: MAYA, status: 'active', rsvp: 'in', name: 'Maya' };
const FRIEND_IN: Person = { uid: FRIEND, status: 'active', rsvp: 'in', name: 'Friend' };

function offered(result: Awaited<ReturnType<typeof openMoney>>): string[] {
  return result.current.ctx.splitMembers.map((member) => member.userId);
}

describe('who a new expense names', () => {
  it('leaves out a crewmate who was removed, and seats the friend who joined after', async () => {
    const result = await openMoney([
      WINSTON,
      MAYA_IN,
      { uid: KHOA, status: 'removed', rsvp: 'out' },
      FRIEND_IN,
    ]);
    await waitFor(() => expect(offered(result)).toEqual([ME, MAYA, FRIEND]));

    // The keypad's draft, and so the command: payer and shares only among those three.
    const draft = newDraft({ currency: 'VND', payerId: ME, memberIds: offered(result) });
    const payload = toAddPayload(
      { ...draft, digits: '600000', mode: 'weights' },
      { expenseId: NEW_EXPENSE, tripId: TRIP, fxSnapshotId: null },
    );
    expect(payload?.split.shares.map((share) => share.user_id)).toEqual([ME, MAYA, FRIEND]);
  });

  it('leaves out someone whose membership ended before their seat row caught up', async () => {
    const result = await openMoney([
      WINSTON,
      MAYA_IN,
      { uid: KHOA, status: 'left', rsvp: 'in' },
      FRIEND_IN,
    ]);
    await waitFor(() => expect(offered(result)).toEqual([ME, MAYA, FRIEND]));
  });

  it('leaves out an active crewmate who is out of the trip or waiting for a seat', async () => {
    const result = await openMoney([
      WINSTON,
      MAYA_IN,
      { uid: KHOA, status: 'active', rsvp: 'out', name: 'Khoa' },
      { uid: FRIEND, status: 'active', rsvp: 'waitlisted', name: 'Friend' },
    ]);
    await waitFor(() => expect(offered(result)).toEqual([ME, MAYA]));
  });

  it('keeps the removed crewmate in the expense they shared and in the balances', async () => {
    const result = await openMoney([
      WINSTON,
      MAYA_IN,
      { uid: KHOA, status: 'removed', rsvp: 'out' },
      FRIEND_IN,
    ]);
    await waitFor(() => expect(offered(result)).toEqual([ME, MAYA, FRIEND]));
    const { ctx, rows } = result.current;

    // Editing the old lunch still shows Khoa's share.
    const lunch = rows.expenses.find((row) => row.id === LUNCH);
    if (lunch === undefined) throw new Error('the lunch did not load');
    const edit = draftFromExpense(lunch, rows.shares, offered(result));
    expect(edit.included).toEqual([ME, MAYA, KHOA]);
    expect(ctx.members.find((member) => member.userId === KHOA)?.active).toBe(false);

    // And what Khoa owes for it is still owed.
    await waitFor(() => expect(result.current.rows.ledger).toHaveLength(2));
    const model = buildBalances({
      uid: ME,
      members: ctx.members,
      shown: ctx.splitMembers,
      ledger: result.current.rows.ledger,
      payments: rows.payments,
      expenses: rows.expenses,
      currency: 'VND',
    });
    expect(model.lines.find((line) => line.userId === KHOA)?.netMinor).toBe(-100_000n);
  });
});
