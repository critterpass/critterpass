/**
 * One ADD is one expense, over the real router and local-first stack. Money's scan entry lands on
 * the keypad while receipts are off; however the keypad was reached and however fast ADD is
 * tapped, exactly one `add_expense` is queued and the person is on Money, with no keypad left to
 * tap again (a keypad opened with nothing under it used to stay up). SAVE on an edit sends once
 * too and returns to the expense.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { AnalyticsProvider, type AnalyticsClient } from '@/lib/analytics';
import { pushTransition } from '@/lib/navigation/transitions';
import { ThemeProvider } from '@/lib/theme';
import { useMotionMode } from '@/motion/motion-mode';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { ShellTabs } from '@/ui/shell/ShellTabs';
import { useTheme } from '@/ui/theme';

import { MoneyServicesProvider, NO_MONEY_SERVICES } from '../../data/services';
import { ScanScreen } from '../../receipt/ScanScreen';
import { editExpenseRoute, expenseRoute, MONEY_ROUTES } from '../../routes';
import { AddExpenseScreen } from '../AddExpenseScreen';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const MAYA = '0199a6f0-0000-7000-8000-00000000d002';
const CREW = '0199a6f0-0000-7000-8000-00000000d101';
const TRIP = '0199a6f0-0000-7000-8000-00000000d201';
const LUNCH = '0199a6f0-0000-7000-8000-00000000d301';

let stack: TestLocalFirst | null = null;

function current(): TestLocalFirst {
  if (stack === null) throw new Error('the local database is not open');
  return stack;
}

/** PostHog is the network boundary: no flag is on (receipts are off) and nothing is sent. */
const analytics = new Proxy(
  { posthog: { getFeatureFlag: () => undefined, onFeatureFlags: () => () => undefined } },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined) },
) as unknown as AnalyticsClient;

function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <I18nProvider i18n={i18n}>
          <ThemeProvider fontScale={1}>
            <AnalyticsProvider client={analytics}>
              <LocalFirstProvider value={current().value}>
                <ScreenJoltProvider>
                  <Stack screenOptions={{ headerShown: false }} />
                </ScreenJoltProvider>
              </LocalFirstProvider>
            </AnalyticsProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** The app's stacks (the Wallet tab's and Money's pushed screens), with no receipt reader. */
function PushStack() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <MoneyServicesProvider services={NO_MONEY_SERVICES}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </MoneyServicesProvider>
  );
}

/** The keypad's route, as the app declares it: `?edit={id}` edits that expense. */
function AddExpenseRoute() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  return <AddExpenseScreen editId={typeof edit === 'string' && edit !== '' ? edit : null} />;
}

/** Money's two ways in, pushed as Balances pushes them. */
function Money() {
  return (
    <View testID="money-home">
      <Pressable testID="money-scan-entry" onPress={() => router.push(MONEY_ROUTES.scan)}>
        <Text>SCAN</Text>
      </Pressable>
      <Pressable testID="money-add-entry" onPress={() => router.push(MONEY_ROUTES.add)}>
        <Text>ADD</Text>
      </Pressable>
    </View>
  );
}

/** The expense's page, whose EDIT pushes the keypad as the real page does. */
function Expense() {
  return (
    <Pressable testID="expense-edit" onPress={() => router.push(editExpenseRoute(LUNCH))}>
      <Text>EDIT</Text>
    </Pressable>
  );
}

/** Me and Maya on a trip to Đà Nẵng that settles in đồng, so nothing converts. */
async function seed({ db, uid }: TestLocalFirst): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  await db.execute(
    `INSERT INTO users (id, display_name, home_currency, home_country)
     VALUES (?, 'Winston', 'VND', 'VN'), (?, 'Maya', 'VND', 'VN')`,
    [uid, MAYA],
  );
  await db.execute(
    `INSERT INTO crews (id, name, settlement_currency) VALUES (?, 'Đà Nẵng', 'VND')`,
    [CREW],
  );
  for (const [index, member] of [uid, MAYA].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, role, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [
        `m-${member}`,
        CREW,
        member,
        member === uid ? 'organiser' : 'member',
        `2026-09-0${index + 1}T00:00:00Z`,
      ],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, holds_seat, created_at)
       VALUES (?, ?, ?, 'in', 1, ?)`,
      [`p-${member}`, TRIP, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, local_currency, tz)
     VALUES (?, ?, 'in_trip', 'VND', 'Asia/Ho_Chi_Minh')`,
    [TRIP, CREW],
  );
}

/** A ₫135,000 lunch I paid, split evenly with Maya, as the server synced it. */
async function seedLunch({ db, uid }: TestLocalFirst): Promise<void> {
  await db.execute(
    `INSERT INTO expenses (id, crew_id, trip_id, payer_id, amount_minor, currency,
       crew_amount_minor, crew_currency, split_mode, category, description, local_date, trip_day,
       spent_at, source, created_by, version, created_at)
     VALUES (?, ?, ?, ?, 135000, 'VND', 135000, 'VND', 'equal', 'food', 'Lunch', '2026-10-02', 1,
       '2026-10-02T02:23:16Z', 'manual', ?, 1, '2026-10-02T02:23:16Z')`,
    [LUNCH, CREW, TRIP, uid, uid],
  );
  for (const member of [uid, MAYA]) {
    await db.execute(
      `INSERT INTO expense_shares (id, expense_id, trip_id, user_id, weight, computed_minor,
         crew_computed_minor)
       VALUES (?, ?, ?, ?, 1, 67500, 67500)`,
      [`s-${member}`, LUNCH, TRIP, member],
    );
  }
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await check()) return;
    if (Date.now() > deadline) throw new Error('timed out waiting for the screen to settle');
  }
}

/** Payloads of every queued `cmd`, in queue order. */
async function queued<Payload>(cmd: string): Promise<Payload[]> {
  const rows = await current().db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq',
    [cmd],
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: Payload }).payload);
}

/** Opens the app at `initialUrl` (Money, in the Wallet tab, unless given), with the trip synced. */
async function openApp(options: { initialUrl?: string; lunch?: boolean } = {}) {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seed(stack);
  if (options.lunch === true) await seedLunch(stack);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const app = renderRouter(
    {
      _layout: Root,
      '(tabs)/_layout': () => <ShellTabs gated={false} />,
      '(tabs)/index': () => <Text>home</Text>,
      '(tabs)/wallet/_layout': PushStack,
      '(tabs)/wallet/money/index': Money,
      'money/_layout': PushStack,
      'money/add': AddExpenseRoute,
      'money/scan': () => <ScanScreen />,
      'money/expense/[id]': Expense,
    },
    { initialUrl: options.initialUrl ?? MONEY_ROUTES.balances },
  );
  // The router's test renderer fakes the clock; the local database, its live queries and the
  // stack's transitions run on the real one.
  jest.useRealTimers();
  await app;
  return { getPathname: () => app.getPathname() };
}

async function press(testID: string): Promise<void> {
  await until(() => screen.queryByTestId(testID) !== null);
  await fireEvent.press(screen.getByTestId(testID));
}

/** Types on the keypad once it is up. */
async function type(...keys: string[]): Promise<void> {
  for (const key of keys) await press(`money-add-keypad-key-${key}`);
}

/**
 * Taps the button `times` in a row with no wait in between, as a quick thumb does: the screen is
 * still up for every tap, since leaving it takes a transition.
 */
async function tapFast(testID: string, times: number): Promise<void> {
  await until(() => screen.queryByTestId(testID) !== null);
  const button = screen.getByTestId(testID);
  for (let tap = 0; tap < times; tap += 1) await fireEvent.press(button);
}

/** Waits for the first command, then gives a late second one, or a late navigation, time to land. */
async function sentAndSettled(cmd: string): Promise<void> {
  await until(async () => (await queued(cmd)).length > 0);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('adding an expense', () => {
  it("adds once from Money's scan entry, however fast ADD is tapped, and lands on Money", async () => {
    const app = await openApp();
    // Receipts are off: the scan route sends the person on to the keypad.
    await press('money-scan-entry');
    await type('1', '3', '5', '000');

    await tapFast('money-add-submit', 3);
    await sentAndSettled('add_expense');

    const sent = await queued('add_expense');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ amount_minor: 135_000, currency: 'VND', trip_id: TRIP });
    expect(screen.queryByTestId('money-add')).toBeNull();
    expect(screen.getByTestId('money-home')).toBeTruthy();
    expect(app.getPathname()).toBe(MONEY_ROUTES.balances);
  });

  it('lands on Money from a keypad with nothing under it, so it cannot be added again', async () => {
    const app = await openApp({ initialUrl: MONEY_ROUTES.add });
    await type('4', '5', '5', '5', '5', '5');

    await press('money-add-submit');
    await sentAndSettled('add_expense');

    expect(screen.queryByTestId('money-add')).toBeNull();
    expect(screen.getByTestId('money-home')).toBeTruthy();
    expect(app.getPathname()).toBe(MONEY_ROUTES.balances);
    expect(await queued('add_expense')).toHaveLength(1);
  });
});

describe('editing an expense', () => {
  it('saves once, however fast SAVE is tapped, and returns to the expense', async () => {
    const app = await openApp({ lunch: true });
    await act(() => Promise.resolve(router.push(expenseRoute(LUNCH))));
    await press('expense-edit');
    // The keypad opens on the expense's ₫135,000; one more 0 makes it ₫1,350,000.
    await type('0');

    await tapFast('money-add-submit', 3);
    await sentAndSettled('edit_expense');

    const edits = await queued('edit_expense');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ expense_id: LUNCH, patch: { amount_minor: 1_350_000 } });
    expect(await queued('add_expense')).toHaveLength(0);
    expect(screen.queryByTestId('money-add')).toBeNull();
    expect(app.getPathname()).toBe(`/money/expense/${LUNCH}`);
  });
});
