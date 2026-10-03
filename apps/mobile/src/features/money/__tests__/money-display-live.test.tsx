/**
 * The price display over the real local-first stack, as on the Wallet tab: an expense row in
 * rupiah gains its home amount ("≈ S$6.40") once Show prices in turns to BOTH (a synced row, or a
 * change made in Settings before it syncs), and loses it again in LOCAL.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, configure, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ExpenseListRow } from '../components/ExpenseListRow';

import { applyMoneyDisplay, clearMoneyDisplayOverride } from '@/data/money/use-money-display';

configure({ asyncUtilTimeout: 5000 });

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  clearMoneyDisplayOverride();
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

const ITEM = {
  id: 'e1',
  title: 'Warung lunch',
  category: 'food' as const,
  payerId: 'p',
  payerName: 'Maya',
  amountMinor: 7_500_000n,
  currency: 'IDR',
  crewAmountMinor: 7_500_000n,
  localDate: '2026-10-02',
  spentAt: '2026-10-02T05:00:00Z',
  leftOut: [],
  shareCount: 2,
  inSplit: ['Maya', 'Khanh'],
  pending: null,
  fromReceipt: false,
};

async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const x = (sql: string, params: unknown[] = []) => stack.db.execute(sql, params);
  await x('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  await x("INSERT INTO users (id, display_name, home_country) VALUES (?, 'Khanh', 'SG')", [
    stack.uid,
  ]);
  await x("INSERT INTO user_settings (id, user_id, price_display) VALUES (?, ?, 'local')", [
    stack.uid,
    stack.uid,
  ]);
  await x(
    `INSERT INTO fx_snapshots (id, base, quote, rate, as_of, source) VALUES
       ('fx1', 'USD', 'IDR', '16000', '2026-10-02', 'ecb'),
       ('fx2', 'USD', 'SGD', '1.3653', '2026-10-02', 'ecb')`,
  );
  return stack;
}

function show(stack: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <LocalFirstProvider value={stack.value}>
          <ExpenseListRow item={ITEM} crewCurrency="IDR" onPress={() => undefined} testID="row" />
        </LocalFirstProvider>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

const label = () => String(screen.getByTestId('row').props.accessibilityLabel);

describe('price display on the Wallet tab', () => {
  it('adds the home amount when the synced setting turns to BOTH, and drops it in LOCAL', async () => {
    const stack = await open();
    await show(stack);
    await waitFor(() => expect(label()).toContain('Warung lunch'));
    expect(label()).not.toContain('≈');
    await stack.db.execute("UPDATE user_settings SET price_display = 'both' WHERE user_id = ?", [
      stack.uid,
    ]);
    await waitFor(() => expect(label()).toMatch(/≈ S\$\s?6\.40/));
    await stack.db.execute("UPDATE user_settings SET price_display = 'local' WHERE user_id = ?", [
      stack.uid,
    ]);
    await waitFor(() => expect(label()).not.toContain('≈'));
  });

  it('shows a change made in Settings at once, before its row syncs', async () => {
    const stack = await open();
    await show(stack);
    await waitFor(() => expect(label()).toContain('Warung lunch'));
    await act(() => applyMoneyDisplay({ mode: 'both' }));
    await waitFor(() => expect(label()).toMatch(/≈ S\$\s?6\.40/));
  });
});
