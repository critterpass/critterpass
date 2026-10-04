/**
 * The calendar sheets as members use them: the connect sheet's rows per state (the Google and
 * Outlook rows only when their flags are on), and marking days by hand with the Free / Maybe /
 * Busy tool, which queues `set_availability` with manual days (and days taken back) and reopens
 * as it was left.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { cloneElement, type ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { AnalyticsProvider, type AnalyticsClient } from '@/lib/analytics';

import { SetupServicesProvider, type SetupServices } from '../../data/services';
import { CalendarConnectSheet } from '../calendar-connect-sheet';
import { ManualDaysSheet } from '../manual-days-sheet';
import { posthogFlagKey } from '@cp/domain';

const TRIP = '0199a6f0-0000-7000-8000-00000000c001';
const NOW = Date.parse('2026-10-02T00:41:00Z');
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const noop = () => undefined;

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await cleanup();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const services: SetupServices = {
  getJson: () => Promise.resolve({ kind: 'offline' }),
  openUrl: () => Promise.resolve(),
  apiUrl: (path) => `https://api.test${path}`,
  now: () => NOW,
};

/** PostHog is the network boundary: flags as the api would bootstrap them, nothing sent. */
function analytics(flags: Record<string, boolean>): AnalyticsClient {
  const client = {
    posthog: {
      getFeatureFlag: (key: string) =>
        Object.entries(flags).find(([flag]) => posthogFlagKey(flag) === key)?.[1],
      onFeatureFlags: () => () => undefined,
    },
    exposure: () => undefined,
  };
  return new Proxy(client, {
    get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined),
  }) as unknown as AnalyticsClient;
}

/**
 * Renders, then renders once more: under Jest's Reanimated double an animation lands instantly but
 * an animated style is only read during render, so the second pass shows the sheet fully up.
 */
async function mount(ui: ReactElement, flags: Record<string, boolean> = {}) {
  stack ??= await openTestLocalFirst({ holdUploads: true });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const client = analytics(flags);
  const current = stack;
  const tree = (node: ReactElement) => (
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <AnalyticsProvider client={client}>
            <LocalFirstProvider value={current.value}>
              <SetupServicesProvider services={services}>{node}</SetupServicesProvider>
            </LocalFirstProvider>
          </AnalyticsProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>
  );
  const view = await render(tree(ui));
  await view.rerender(tree(cloneElement(ui)));
  return view;
}

describe('calendar connect sheet', () => {
  it('shows the Google row only while its flag is on', async () => {
    const off = await mount(
      <CalendarConnectSheet tripId={TRIP} onDismiss={noop} onMarkByHand={noop} />,
    );
    expect(screen.queryByTestId('calendar-provider-google')).toBeNull();
    await off.unmount();
    await mount(<CalendarConnectSheet tripId={TRIP} onDismiss={noop} onMarkByHand={noop} />, {
      'calendar.oauth_google': true,
    });
    expect(await screen.findByTestId('calendar-provider-google')).toBeTruthy();
    expect(screen.queryByTestId('calendar-provider-microsoft')).toBeNull();
    // No device calendar reader in this build: by hand only.
    expect(screen.getByTestId('calendar-device-unavailable')).toBeTruthy();
  });
});

describe('marking days by hand', () => {
  it('paints days with the chosen tool and saves the marks as manual days', async () => {
    const done = jest.fn();
    await mount(<ManualDaysSheet tripId={TRIP} onDismiss={done} tz="Asia/Tokyo" />);
    const day = await screen.findByTestId('manual-day-2026-10-05');
    await fireEvent.press(day);
    await fireEvent.press(screen.getByTestId('manual-tool-busy'));
    await fireEvent.press(screen.getByTestId('manual-day-2026-10-06'));
    await fireEvent.press(screen.getByTestId('manual-tool-maybe'));
    await fireEvent.press(screen.getByTestId('manual-day-2026-10-07'));
    await fireEvent.press(screen.getByTestId('manual-day-2026-10-07'));
    expect(screen.getByLabelText('October 6, Busy')).toBeTruthy();
    expect(screen.getByLabelText('October 7, Not marked')).toBeTruthy();
    // Days before today cannot be marked.
    expect(screen.queryByTestId('manual-day-2026-10-01')).toBeNull();
    await fireEvent.press(screen.getByTestId('manual-days-save'));
    await waitFor(() => expect(done).toHaveBeenCalled());

    const rows = await stack!.db.getAll<{ cmd: string; envelope: string }>(
      'SELECT cmd, envelope FROM commands',
    );
    expect(
      rows.map((row) => [row.cmd, (JSON.parse(row.envelope) as { payload: unknown }).payload]),
    ).toEqual([
      [
        'set_availability',
        {
          trip_id: TRIP,
          days: [
            { date: '2026-10-05', state: 'free', source: 'manual' },
            { date: '2026-10-06', state: 'busy', source: 'manual' },
          ],
        },
      ],
    ]);
  });

  it('reopens as left, and clears a day taken back', async () => {
    await mount(<ManualDaysSheet tripId={TRIP} onDismiss={noop} tz="Asia/Tokyo" />);
    await fireEvent.press(await screen.findByTestId('manual-day-2026-10-05'));
    await fireEvent.press(screen.getByTestId('manual-days-save'));
    await waitFor(async () =>
      expect(await stack!.db.getAll('SELECT id FROM local_private')).toHaveLength(1),
    );
    await screen.unmount();

    await mount(<ManualDaysSheet tripId={TRIP} onDismiss={noop} tz="Asia/Tokyo" />);
    await waitFor(() => expect(screen.getByLabelText('October 5, Free')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('manual-day-2026-10-05'));
    expect(screen.getByLabelText('October 5, Not marked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('manual-days-save'));
    await waitFor(async () =>
      expect(await stack!.db.getAll('SELECT id FROM commands')).toHaveLength(2),
    );
    const last = await stack!.db.get<{ envelope: string }>(
      'SELECT envelope FROM commands ORDER BY seq DESC LIMIT 1',
    );
    expect((JSON.parse(last.envelope) as { payload: unknown }).payload).toEqual({
      trip_id: TRIP,
      days: [],
      clear: ['2026-10-05'],
    });
  });
});
