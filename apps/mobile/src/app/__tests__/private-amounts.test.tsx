/**
 * A problem report's screenshot never shows what the crew spent or who owes what: with the mask up,
 * the balance, every member's bar amount, an expense row's amount, each payment on Settle up and
 * an expense's shares sit under a cover, while the names stay readable.
 */
// The money screens reach the device database opener and the billing module, which Jest cannot
// load; these pieces draw from their props.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { describe, expect, it, jest } from '@jest/globals';
import { screen, within } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { buildBalances } from '@/features/money/balances/model';
import { BalanceBars } from '@/features/money/premium/components/BalanceBars';
import { BalanceHero } from '@/features/money/premium/components/BalanceHero';
import { ExpenseRow } from '@/features/money/premium/components/ExpenseRow';
import { PaymentCard } from '@/features/money/premium/SettlePremium';
import { settleRows } from '@/features/money/settle/model';
import {
  LAB_LATEST,
  LAB_LEDGER,
  LAB_MEMBERS,
  LAB_UID,
  labPayment,
} from '@/features/money/test-support/lab-fixtures';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/lib/test-support/render-ui';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const noop = () => undefined;

function framed(node: ReactNode): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{node}</ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

const model = buildBalances({
  uid: LAB_UID,
  members: LAB_MEMBERS,
  shown: LAB_MEMBERS,
  ledger: LAB_LEDGER,
  payments: [],
  expenses: [{ crew_amount_minor: 481_200, crew_currency: 'USD' }],
  currency: 'USD',
});

describe('money in a problem report screenshot', () => {
  it('covers the balance, the bars and the latest expense, and keeps the names', async () => {
    await renderUi(
      framed(
        <>
          <BalanceHero
            kind={model.hero.kind}
            amountMinor={model.hero.amountMinor}
            currency="USD"
            solo={false}
            onCurrency={noop}
          />
          <BalanceBars lines={model.lines} currency="USD" onMember={noop} />
          <ExpenseRow item={LAB_LATEST} crewCurrency="USD" onOpen={noop} testID="money-latest" />
        </>,
      ),
    );
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('money-hero-amount'))).toBe(true);
      const bars = within(screen.getByTestId('money-bars'));
      expect(bars.getAllByTestId('private-content-cover')).toHaveLength(model.lines.length);
      const latest = within(screen.getByTestId('money-latest'));
      expect(latest.getAllByTestId('private-content-cover').length).toBeGreaterThan(0);
      expect(isCovered(latest.getByText(LAB_LATEST.title))).toBe(false);
    });
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
  });

  it('covers each payment on Settle up', async () => {
    const rows = settleRows({
      uid: LAB_UID,
      payments: [labPayment('p-jordan', 'u-jordan', LAB_UID, 9210, 'requested')],
      plan: [{ fromId: 'u-rin', toId: 'u-maya', amountMinor: 4100n }],
      currency: 'USD',
      now: new Date('2026-10-15T12:00:00Z'),
    });
    const settle = { members: LAB_MEMBERS, onRow: noop, onNudge: noop };
    await renderUi(
      framed(
        <>
          {rows.map((row) => (
            <PaymentCard key={row.key} settle={settle} row={row} />
          ))}
        </>,
      ),
    );
    await whileMasked(() => {
      for (const row of rows) {
        const card = within(screen.getByTestId(`money-settle-row-${row.key}`));
        expect(card.getAllByTestId('private-content-cover')).toHaveLength(1);
      }
    });
  });
});
