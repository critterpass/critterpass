/**
 * The ways into the paywall and the boost sheet. Each offer another area shows opens the right
 * screen for the right trip, and the paywall is told which entry it was opened from, since the
 * server's daily limit and the "not for this trip" rule count by entry.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

// The other areas' own imports open native modules; only the registrations run here.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('@/data/powersync/db', () => ({}));
// The store's SDK is never called here.
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';

/* eslint-disable boundaries/dependencies -- each slot's read side belongs to its own area; read here to prove what was registered. */
import { mailboxPaywall } from '@/features/bookings/mailbox/mailbox-slot';
import { liveMapPaywall } from '@/features/crew/live-map/gate-slot';
import { redraftBoost } from '@/features/plan/draft/boost-slot';
import { seatBoost } from '@/features/proposal/crowd/boost-slot';
/* eslint-enable boundaries/dependencies */
import { hrefFor } from '@/lib/navigation/screen-registry';

import '../register';
import { boostHref, MONETIZE_ROUTES } from '../routes';

const push = router.push as jest.Mock;

// Loading the registrations pulls in most of the app's modules: a wide budget for slow runners.
jest.setTimeout(180_000);

describe('ways into the paywall and the boost sheet', () => {
  it.each([
    ['the spent-redrafts offer', redraftBoost],
    ['the seventh-seat offer', seatBoost],
    ['the live map gate', liveMapPaywall],
  ])('%s opens the boost sheet for its trip', (_name, slot) => {
    push.mockClear();
    const open = slot();
    expect(open).not.toBeNull();
    open?.('trip-1');
    expect(push).toHaveBeenCalledWith(boostHref('trip-1'));
  });

  it('the mailbox teaser opens the paywall', () => {
    push.mockClear();
    mailboxPaywall()?.();
    expect(push).toHaveBeenCalledWith({ pathname: MONETIZE_ROUTES.paywall, params: {} });
  });

  it('the paywall keeps the entry and the trip it was opened with', () => {
    expect(hrefFor('4e-1', { entry: 'guide_limit', tripId: 'trip-1' })).toEqual({
      pathname: MONETIZE_ROUTES.paywall,
      params: { entry: 'guide_limit', tripId: 'trip-1' },
    });
    expect(hrefFor('4e-1')).toEqual({ pathname: MONETIZE_ROUTES.paywall, params: {} });
  });
});
