/**
 * The profile over the real local-first stack, as a fresh account meets it: the rows onboarding
 * leaves behind are enough to show a name, a home and a home stamp; a row that syncs later shows
 * up without reopening the screen; SETTINGS opens Settings and Home's header finds the profile.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/you',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { YOU_ROUTES } from '../../routes';
import { ProfileScreen } from '../profile-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const PASS = '0192f000-0000-7000-8000-00000000aa01';
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

/** What sync leaves on the phone right after onboarding: a user, a pass, a taste, a home stamp. */
async function openFresh(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const x = (sql: string, params: unknown[] = []) => stack.db.execute(sql, params);
  await x('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  await x(
    `INSERT INTO users (id, display_name, home_airport, home_country, member_since)
     VALUES (?, 'Khánh', 'SGN', 'VN', '2026-10-01')`,
    [stack.uid],
  );
  await x("INSERT INTO passes (id, user_id, status, number) VALUES (?, ?, 'issued', 'CP-0012')", [
    PASS,
    stack.uid,
  ]);
  await x(`INSERT INTO taste_profiles (id, user_id, tags) VALUES (?, ?, '["street_food"]')`, [
    `taste-${stack.uid}`,
    stack.uid,
  ]);
  await x(
    `INSERT INTO stamps (id, pass_id, user_id, kind, seq_no, iata, country, status)
     VALUES ('stamp-home', ?, ?, 'home', 1, 'SGN', 'VN', 'stamped')`,
    [PASS, stack.uid],
  );
  return stack;
}

async function show(stack: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <ProfileScreen now={() => new Date('2026-10-01T09:00:00')} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('the profile for a fresh account', () => {
  it('shows who they are from the rows onboarding left, and no dead controls', async () => {
    const stack = await openFresh();
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('you-profile-name')).toBeTruthy());
    expect(screen.getByText('KHÁNH')).toBeTruthy();
    expect(screen.getByTestId('you-profile-handle').props.children).toBe('Ho Chi Minh City');
    expect(screen.getByTestId('you-profile-stamp-home')).toBeTruthy();
    expect(screen.getByTestId('you-profile-no-trips')).toBeTruthy();
    expect(screen.getByTestId('you-profile-start-crew')).toBeTruthy();
    expect(screen.getByTestId('you-profile-mrz').props.children).toBe('P<VNMKHANH<<CP0012');
    // Edit profile has no screen yet, so its pill is not drawn.
    expect(screen.queryByTestId('you-profile-edit')).toBeNull();
    expect(screen.queryByTestId('you-profile-pass-plus')).toBeNull();
  });

  it('picks up a username that syncs in while the screen is open', async () => {
    const stack = await openFresh();
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('you-profile-name')).toBeTruthy());
    await stack.db.execute("UPDATE users SET username = 'khanh' WHERE id = ?", [stack.uid]);
    await waitFor(() =>
      expect(screen.getByTestId('you-profile-handle').props.children).toBe(
        '@khanh · Ho Chi Minh City',
      ),
    );
  });

  it('opens Settings, and the profile is registered under its design id', async () => {
    const stack = await openFresh();
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('you-profile-settings')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('you-profile-settings'));
    expect(router.push).toHaveBeenCalledWith(YOU_ROUTES.settings);
    // Home's "HEY {NAME} ›" asks the registry for this design id.
    expect(hrefFor('3n-1')).toBe(YOU_ROUTES.profile);
  });
});
