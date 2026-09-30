/**
 * Balances over the real local-first stack, for a crew that never picked a settlement currency:
 * the server writes that crew's ledger in USD, so Money must net the ledger in USD too, whatever
 * the viewer's home currency. Netting it in the viewer's currency left every balance at zero.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
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

import { buildBalances } from '../../balances/model';
import { useMoneyContext } from '../use-money-context';
import { useTripMoney } from '../use-trip-money';

const ME = '0199a6f0-0000-7000-8000-00000000c001';
const MAYA = '0199a6f0-0000-7000-8000-00000000c002';
const RIN = '0199a6f0-0000-7000-8000-00000000c003';
const CREW = '0199a6f0-0000-7000-8000-00000000c101';
const TRIP = '0199a6f0-0000-7000-8000-00000000c201';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function seed(db: TestLocalFirst['db']): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    ME,
  ]);
  await db.execute(
    `INSERT INTO users (id, display_name, home_currency, home_country) VALUES (?, 'Winston', 'SGD', 'SG')`,
    [ME],
  );
  await db.execute(`INSERT INTO crews (id, name, settlement_currency) VALUES (?, 'Bali', NULL)`, [
    CREW,
  ]);
  for (const [index, uid] of [ME, MAYA, RIN].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, role, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [
        `m-${uid}`,
        CREW,
        uid,
        uid === ME ? 'organiser' : 'member',
        `2026-09-0${index + 1}T00:00:00Z`,
      ],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, holds_seat, created_at)
       VALUES (?, ?, ?, 'in', 1, ?)`,
      [`p-${uid}`, TRIP, uid, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, local_currency) VALUES (?, ?, 'confirmed', 'IDR')`,
    [TRIP, CREW],
  );
  // Rp 450,000 paid by me, split three ways and re-expressed in the crew's currency.
  for (const debtor of [MAYA, RIN]) {
    await db.execute(
      `INSERT INTO ledger_entries (id, crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency)
       VALUES (?, ?, ?, ?, ?, 835, 'USD')`,
      [`l-${debtor}`, CREW, TRIP, debtor, ME],
    );
  }
}

describe('a crew without a settlement currency', () => {
  it('nets the ledger in the currency the server wrote it in', async () => {
    stack = await openTestLocalFirst({ uid: ME });
    await seed(stack.db);
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
    await waitFor(() => expect(result.current.rows.ledger).toHaveLength(2));
    const { ctx, rows } = result.current;
    expect(ctx.crew?.settlementCurrency).toBe('USD');

    const model = buildBalances({
      uid: ME,
      members: ctx.members,
      shown: ctx.splitMembers,
      ledger: rows.ledger,
      payments: rows.payments,
      expenses: rows.expenses,
      currency: ctx.crew?.settlementCurrency ?? '',
    });
    expect(model.lines.find((row) => row.userId === ME)?.netMinor).toBe(1670n);
    expect(model.lines.find((row) => row.userId === MAYA)?.netMinor).toBe(-835n);
  });
});
