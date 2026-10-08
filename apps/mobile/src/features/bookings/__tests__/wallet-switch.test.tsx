jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Slot } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../lib/theme';
import { WalletSwitch } from '../stack/WalletSwitch';
import { WALLET_HALF_OPTIONS } from '../stack/wallet-halves';

// Imported last: the testing library registers its own Reanimated mock (see jest.config.js).
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Root() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <Slot />
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function WalletStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="money/index" options={WALLET_HALF_OPTIONS} />
      <Stack.Screen name="bookings" options={WALLET_HALF_OPTIONS} />
    </Stack>
  );
}

function half(current: 'bookings' | 'money') {
  return function Half() {
    return (
      <>
        <WalletSwitch current={current} />
        <Text>{`${current} half`}</Text>
      </>
    );
  };
}

const ROUTES = {
  _layout: Root,
  'wallet/_layout': Object.assign(WalletStack, {
    unstable_settings: { initialRouteName: 'money/index' },
  }),
  'wallet/money/index': half('money'),
  'wallet/bookings/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  'wallet/bookings/index': half('bookings'),
};

async function open(url: string) {
  const pending = renderRouter(ROUTES, { initialUrl: url });
  await pending;
  await act(async () => {});
  return {
    getPathname: () => pending.getPathname(),
    walletRoutes: () => {
      const root = pending.getRouterState()?.routes[0]?.state;
      const wallet = root?.routes.find((route) => route.name === 'wallet');
      return wallet?.state?.routes.map((route) => route.name) ?? [];
    },
  };
}

async function tap(label: string) {
  await fireEvent.press(screen.getByRole('radio', { name: label }));
  await act(async () => {});
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('WalletSwitch', () => {
  it('swaps Money for Bookings and back without growing the stack', async () => {
    const router = await open('/wallet/money');
    await tap('BOOKINGS');
    expect(router.getPathname()).toBe('/wallet/bookings');
    expect(screen.getByText('bookings half')).toBeTruthy();
    await tap('MONEY');
    expect(router.getPathname()).toBe('/wallet/money');
    await tap('BOOKINGS');
    await tap('MONEY');
    expect(router.getPathname()).toBe('/wallet/money');
    expect(router.walletRoutes()).toEqual(['money/index']);
  });

  it('opens Bookings from its link and switches to a single Money root', async () => {
    const router = await open('/wallet/bookings');
    expect(screen.getByText('bookings half')).toBeTruthy();
    await tap('MONEY');
    expect(router.getPathname()).toBe('/wallet/money');
    expect(router.walletRoutes()).toEqual(['money/index']);
  });

  it('shows both halves in place: no transition and no back swipe', () => {
    expect(WALLET_HALF_OPTIONS).toMatchObject({ animation: 'none', gestureEnabled: false });
  });
});
