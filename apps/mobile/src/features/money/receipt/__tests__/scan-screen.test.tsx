/**
 * The receipt scan over the real router and local-first stack, with the device (photo picker,
 * reader, upload) and the api answered at their boundaries and the server's parse arriving as the
 * synced `receipts` row. A scan never ends in silence: a receipt the server could not read says so
 * and offers typing it in or a retake; a parse that takes too long offers typing it in; SPLIT IT
 * commits once however fast it is tapped and lands on Money; a commit that does not go through
 * says what to do and keeps the review.
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

import type { PostReceiptBody } from '@cp/domain';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { router } from 'expo-router';
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
import type { SyncTransport } from '@/data/powersync/transport';
import { AnalyticsProvider, type AnalyticsClient } from '@/lib/analytics';
import { ThemeProvider } from '@/lib/theme';
import { toastQueue } from '@/motion/island-toast/queue';
import { useMotionMode } from '@/motion/motion-mode';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { ShellTabs } from '@/ui/shell/ShellTabs';

import { MoneyServicesProvider, NO_MONEY_SERVICES, type MoneyServices } from '../../data/services';
import { MONEY_ROUTES } from '../../routes';
import { ScanScreen } from '../ScanScreen';
import { useWaitedTooLong } from '../use-scan';

// Imported last: see ui/shell/__tests__/tab-bar.test.tsx for why.
import { act, fireEvent, renderHook, renderRouter, screen } from 'expo-router/testing-library';

const MAYA = '0199a6f0-0000-7000-8000-00000000e002';
const CREW = '0199a6f0-0000-7000-8000-00000000e101';
const TRIP = '0199a6f0-0000-7000-8000-00000000e201';

let stack: TestLocalFirst | null = null;
let posted: PostReceiptBody[] = [];
let commits: unknown[] = [];
let services: MoneyServices;

function current(): TestLocalFirst {
  if (stack === null) throw new Error('the local database is not open');
  return stack;
}

/** PostHog is the network boundary: every flag is on (receipts included), nothing is sent. */
const analytics = new Proxy(
  { posthog: { getFeatureFlag: () => true, onFeatureFlags: () => () => undefined } },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined) },
) as unknown as AnalyticsClient;

/** The device and the api at their edges: a picked photo, its lines as read, the upload. */
const device: MoneyServices = {
  ...NO_MONEY_SERVICES,
  reader: {
    recognize: () =>
      Promise.resolve({
        status: 'ok',
        quality: null,
        lines: [
          {
            id: 'l0',
            text: 'Bia hơi Hà Nội 3 126.000 378.000',
            bbox: [0.1, 0.2, 0.8, 0.03],
            conf: 0.9,
          },
          {
            id: 'l1',
            text: 'Chả ốc Tràng An 1 119.000 119.000',
            bbox: [0.1, 0.25, 0.8, 0.03],
            conf: 0.9,
          },
          { id: 'l2', text: 'Tổng thanh toán 497.000đ', bbox: [0.1, 0.4, 0.8, 0.03], conf: 0.9 },
        ],
      }),
    scanDocument: () => Promise.resolve({ status: 'cancelled' }),
  },
  pickPhoto: () => Promise.resolve({ kind: 'picked', uri: 'file:///receipt.jpg' }),
  uploadReceiptPhoto: () => Promise.resolve({ kind: 'ok', value: 'receipts/photo.jpg' }),
  postReceipt: (body) => {
    posted.push(body);
    return Promise.resolve({ kind: 'ok', value: { status: 'queued' } });
  },
};

/** The command door: SPLIT IT answered after a moment (as over a phone network), or not at all. */
function api(answer: 'applied' | 'unreachable'): SyncTransport {
  return {
    postJson: async (path, body) => {
      if (answer === 'unreachable') throw new Error('network down');
      commits.push({ path, body });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { status: 200, body: { status: 'applied', result: {} } };
    },
  };
}

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
                  <MoneyServicesProvider services={services}>
                    <Stack screenOptions={{ headerShown: false }} />
                  </MoneyServicesProvider>
                </ScreenJoltProvider>
              </LocalFirstProvider>
            </AnalyticsProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Money() {
  return (
    <View testID="money-home">
      <Pressable testID="money-scan-entry" onPress={() => router.push(MONEY_ROUTES.scan)}>
        <Text>SCAN</Text>
      </Pressable>
    </View>
  );
}

/** Me and Maya on a trip in Vietnam that settles in đồng. */
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
        `2026-09-0${index + 1}`,
      ],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, rsvp, holds_seat, created_at)
       VALUES (?, ?, ?, 'in', 1, ?)`,
      [`p-${member}`, TRIP, member, `2026-09-0${index + 1}`],
    );
  }
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, local_currency, tz)
     VALUES (?, ?, 'in_trip', 'VND', 'Asia/Ho_Chi_Minh')`,
    [TRIP, CREW],
  );
}

/** The bill as the server parses it: two dishes and the printed total, in whole đồng. */
const PARSED = {
  merchant: 'Tràng An',
  datetime: null,
  currency: 'VND',
  lines: [
    { line_id: 'l0', label: 'Bia hơi Hà Nội', qty: 3, amount_minor: 378_000, kind: 'item' },
    { line_id: 'l1', label: 'Chả ốc Tràng An', qty: 1, amount_minor: 119_000, kind: 'item' },
  ],
  total_minor: 497_000,
  total_line_id: 'l2',
  lines_total_minor: 497_000,
  matches_total: true,
  status: 'parsed',
};

/** The server's answer reaches the phone as the synced `receipts` row. */
async function parseLands(status: 'parsed' | 'failed'): Promise<void> {
  const receiptId = posted[0]?.receipt_id;
  if (receiptId === undefined) throw new Error('nothing was posted');
  await current().db.execute(
    `INSERT INTO receipts (id, user_id, trip_id, crew_id, status, ocr_source, parsed, failure_reason)
     VALUES (?, ?, ?, ?, ?, 'device', ?, ?)`,
    [
      receiptId,
      current().uid,
      TRIP,
      CREW,
      status,
      status === 'parsed' ? JSON.stringify(PARSED) : null,
      status === 'failed' ? 'unreadable' : null,
    ],
  );
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await check()) return;
    if (Date.now() > deadline) throw new Error('timed out waiting for the screen to settle');
  }
}

async function press(testID: string): Promise<void> {
  await until(() => screen.queryByTestId(testID) !== null);
  await fireEvent.press(screen.getByTestId(testID));
}

/** Opens Money, takes SCAN and picks the photo; the scan is then waiting for the server. */
async function openScan(answer: 'applied' | 'unreachable', using: MoneyServices) {
  services = using;
  stack = await openTestLocalFirst({ transport: api(answer) });
  await seed(stack);
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const app = renderRouter(
    {
      _layout: Root,
      '(tabs)/_layout': () => <ShellTabs gated={false} />,
      '(tabs)/index': () => <Text>home</Text>,
      '(tabs)/wallet/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
      '(tabs)/wallet/money/index': Money,
      'money/scan': ScanScreen,
      'money/add': () => <View testID="money-add" />,
    },
    { initialUrl: MONEY_ROUTES.balances },
  );
  // The router's test renderer fakes the clock; the local database runs on the real one.
  jest.useRealTimers();
  await app;
  await press('money-scan-entry');
  await press('money-scan-pick');
  return { getPathname: () => app.getPathname() };
}

async function scanAPhoto(answer: 'applied' | 'unreachable' = 'applied') {
  const app = await openScan(answer, device);
  await until(() => posted.length === 1);
  return app;
}

beforeAll(async () => {
  // A member on reduced motion (the app's own setting): the review's rows appear without their
  // entrance animation, which Jest's Reanimated stand-in does not provide.
  const { result, unmount } = await renderHook(() => useMotionMode());
  await act(() => {
    result.current[1]('reduced');
    return Promise.resolve();
  });
  await unmount();
});

afterEach(async () => {
  toastQueue.resetForTests();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
  posted = [];
  commits = [];
});

describe('a scanned receipt', () => {
  it('sends what the phone read with the uploaded photo', async () => {
    await scanAPhoto();
    expect(posted[0]).toMatchObject({
      trip_id: TRIP,
      media_key: 'receipts/photo.jpg',
      ocr_status: 'ok',
    });
    expect(posted[0]?.ocr_lines).toHaveLength(3);
    expect(screen.getByTestId('money-scan-reading')).toBeTruthy();
  });

  it('says when the photo picker fails, and keeps every other way in', async () => {
    await openScan('applied', { ...device, pickPhoto: () => Promise.resolve({ kind: 'failed' }) });

    await until(() => screen.queryByTestId('money-scan-pick_failed') !== null);
    expect(screen.getByText(/couldn't open that photo/i)).toBeTruthy();
    expect(screen.getByTestId('money-scan-start')).toBeTruthy();
    expect(screen.getByTestId('money-scan-type')).toBeTruthy();
    expect(posted).toHaveLength(0);
  });

  it('says it could not be read and offers typing it in or a retake', async () => {
    const app = await scanAPhoto();
    await parseLands('failed');

    await until(() => screen.queryByTestId('money-scan-unreadable') !== null);
    expect(screen.getByText(/couldn't read that one/i)).toBeTruthy();
    expect(screen.getByTestId('money-scan-retake')).toBeTruthy();
    expect(app.getPathname()).toBe(MONEY_ROUTES.scan);

    await press('money-scan-unreadable-type');
    await until(() => app.getPathname() === MONEY_ROUTES.add);
  });

  it('splits once however fast SPLIT IT is tapped, and lands on Money', async () => {
    const app = await scanAPhoto();
    await parseLands('parsed');
    await until(() => screen.queryByTestId('money-review-commit') !== null);
    expect(screen.getByText(/^Bia hơi Hà Nội/)).toBeTruthy();

    // Who had the beer: the picker over the review, and back to it.
    await press('money-review-line-l0');
    await until(() => screen.queryByTestId('money-member-picker') !== null);
    expect(app.getPathname()).toBe(MONEY_ROUTES.scan);
    await press('money-member-done');
    await until(() => screen.queryByTestId('money-member-picker') === null);
    expect(app.getPathname()).toBe(MONEY_ROUTES.scan);

    const commit = screen.getByTestId('money-review-commit');
    for (let tap = 0; tap < 3; tap += 1) await fireEvent.press(commit);
    await until(() => app.getPathname() === MONEY_ROUTES.balances);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ path: '/v1/cmd/commit_receipt' });
    expect(screen.getByTestId('money-home')).toBeTruthy();
  });

  it('says what to do when the split cannot reach the server, and keeps the review', async () => {
    const app = await scanAPhoto('unreachable');
    await parseLands('parsed');
    await press('money-review-commit');

    await until(() => toastQueue.getCurrent() !== null);
    expect(toastQueue.getCurrent()?.title).toMatch(/try split it again/i);
    expect(app.getPathname()).toBe(MONEY_ROUTES.scan);
    expect(screen.getByTestId('money-review-commit')).toBeTruthy();
  });
});

describe('a parse that takes too long', () => {
  it('offers a way out once the wait runs long, and starts over for the next receipt', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      ({ key }: { key: string | null }) => useWaitedTooLong(key, 1_000),
      { initialProps: { key: 'first' } },
    );
    expect(result.current).toBe(false);
    await act(() => {
      jest.advanceTimersByTime(1_000);
      return Promise.resolve();
    });
    expect(result.current).toBe(true);

    await rerender({ key: 'second' });
    expect(result.current).toBe(false);
    await rerender({ key: null });
    await act(() => {
      jest.advanceTimersByTime(1_000);
      return Promise.resolve();
    });
    expect(result.current).toBe(false);
    jest.useRealTimers();
  });
});
