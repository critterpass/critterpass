/**
 * When the visit consent sheet rises by itself: on a trip day, at a calm moment on the trip's own
 * screen, never on another screen, over a ceremony or a sheet, or while typing, and once. The engine is the real one over a
 * stand-in for the native session.
 */
// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../test-support/skia-double'));
let mockPathname = '/pass';
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useIsFocused: () => true,
  router: { back: () => undefined },
}));

import { act, fireEvent, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NavigationContext } from 'expo-router/react-navigation';
import type { ContextType, ReactElement } from 'react';
import { AppState, Keyboard, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  createLocationEngine,
  isTripSurfacePath,
  setLocationEngine,
  shouldAskVisitConsent,
  VISIT_CONSENT_CALM_MS,
  type LocationSessionPort,
} from '@/lib/location';

import { resetTabBarCoverForTests, useTabBarCover } from '../../sheet/tab-bar-cover';
import { renderUi } from '../../test-support/render';
import { VisitConsentHost } from '../VisitConsentHost';
import { VisitConsentRow } from '../VisitConsentSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const HUB = '/trips/01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';
/** 2026-10-12 10:00 in Bali, a day of the trip below. */
const NOW = Date.parse('2026-10-12T02:00:00Z');

const session: LocationSessionPort = {
  startTripSession: () => Promise.resolve(true),
  stopTripSession: () => Promise.resolve(),
  setAccuracy: () => undefined,
  isSessionRunning: () => true,
  monitorRegions: () => Promise.resolve(0),
  clearRegions: () => Promise.resolve(),
  isLowPowerMode: () => false,
  drainRegionEvents: () => [],
  addFixListener: () => ({ remove: () => undefined }),
  addRegionListener: () => ({ remove: () => undefined }),
};

/** The engine as the app runs it; `tripDay: false` is a day with no trip. */
async function engineOn(tripDay: boolean) {
  const engine = createLocationEngine({
    session,
    upload: () => Promise.resolve({ status: 202 }),
    platform: 'ios',
    now: () => NOW,
  });
  await engine.update({
    trip: tripDay
      ? {
          status: 'in_trip',
          startDate: '2026-10-10',
          endDate: '2026-10-14',
          tz: 'Asia/Makassar',
          destinationCountry: 'ID',
        }
      : null,
    homeCountry: 'VN',
    exploreAtHome: false,
    deviceTz: 'Asia/Makassar',
    level: 'wiu',
    share: null,
    appActive: true,
    geofenceContext: null,
    androidBackgroundGeofences: false,
  });
  setLocationEngine(engine);
}

/** The hub as a navigator sees it: the focused screen of a tab. */
const HUB_SCREEN = {
  isFocused: () => true,
  addListener: () => () => undefined,
  getState: () => ({ type: 'tab' }),
  getParent: () => undefined,
} as unknown as ContextType<typeof NavigationContext>;

/** Stands for a sheet the hub has open: it registers the way every sheet and rise does. */
function OpenSheet() {
  useTabBarCover();
  return null;
}

const onAnswer = jest.fn();
const tree = (decided = false, sheetOnHub = false): ReactElement => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <NavigationContext.Provider value={HUB_SCREEN}>
      {sheetOnHub ? <OpenSheet /> : null}
    </NavigationContext.Provider>
    <VisitConsentRow />
    <VisitConsentHost decided={decided} onAnswer={onAnswer} />
  </SafeAreaProvider>
);
const rest = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
const sheetUp = () => screen.queryByTestId('visit-consent-accept') !== null;

beforeEach(() => {
  // The app is in front (React Native's Jest double leaves the state unset).
  (AppState as { currentState: string }).currentState = 'active';
  jest.useFakeTimers();
  onAnswer.mockClear();
  resetTabBarCoverForTests();
  mockPathname = '/pass';
});

afterEach(() => {
  setLocationEngine(null);
  jest.useRealTimers();
});

describe('visit consent host', () => {
  it('knows the trip’s own screen from everything else', () => {
    expect(['/trips', HUB].every(isTripSurfacePath)).toBe(true);
    expect(
      [
        '/',
        '/pass',
        '/wallet',
        '/wallet/bookings/add',
        '/crew/abc',
        `${HUB}/day/today`,
        `${HUB}/plan`,
        '/hatch/abc',
        '/settings/account',
      ].some(isTripSurfacePath),
    ).toBe(false);
  });

  it('asks only when every condition holds at that moment', () => {
    const calm = {
      tripDaySessionRunning: true,
      decided: false,
      dismissed: false,
      restedOnTripSurface: true,
      busy: false,
    };
    expect(shouldAskVisitConsent(calm)).toBe(true);
    expect(shouldAskVisitConsent({ ...calm, tripDaySessionRunning: false })).toBe(false);
    expect(shouldAskVisitConsent({ ...calm, decided: true })).toBe(false);
    expect(shouldAskVisitConsent({ ...calm, dismissed: true })).toBe(false);
    expect(shouldAskVisitConsent({ ...calm, restedOnTripSurface: false })).toBe(false);
    expect(shouldAskVisitConsent({ ...calm, busy: true })).toBe(false);
  });

  it('never rises over a screen that is not the trip’s own, however long the trip day runs', async () => {
    await engineOn(true);
    await renderUi(tree());
    await rest(10 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
  });

  it('never rises on a day with no trip, or once the traveller has decided', async () => {
    mockPathname = HUB;
    await engineOn(false);
    const view = await renderUi(tree());
    await rest(2 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    await view.unmount();

    await engineOn(true);
    await renderUi(tree(true));
    await rest(2 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
  });

  it('waits for the trip screen to rest, and starts over when a ceremony takes the screen', async () => {
    mockPathname = HUB;
    await engineOn(true);
    const view = await renderUi(tree());
    await rest(VISIT_CONSENT_CALM_MS - 500);
    expect(sheetUp()).toBe(false);

    // The arrival hatch opens over the hub before the wait is over.
    mockPathname = '/hatch/abc';
    await view.rerender(tree());
    await rest(3 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);

    // Back on the hub the wait is a whole one again.
    mockPathname = HUB;
    await view.rerender(tree());
    await rest(VISIT_CONSENT_CALM_MS - 500);
    expect(sheetUp()).toBe(false);
    await rest(600);
    expect(sheetUp()).toBe(true);
  });

  it('waits while another sheet is up over the trip screen', async () => {
    mockPathname = HUB;
    await engineOn(true);
    const view = await renderUi(tree(false, true));
    await rest(3 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    await view.rerender(tree(false, false));
    await rest(VISIT_CONSENT_CALM_MS + 100);
    expect(sheetUp()).toBe(true);
  });

  it('waits while the traveller is typing: the keyboard up or a text field in focus', async () => {
    mockPathname = HUB;
    await engineOn(true);
    await renderUi(tree());
    const keyboard = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    await rest(3 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    keyboard.mockReturnValue(false);
    const focused = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue({} as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
    await rest(3 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    focused.mockRestore();
    keyboard.mockRestore();
    await rest(VISIT_CONSENT_CALM_MS + 100);
    expect(sheetUp()).toBe(true);
  });

  it('does not rise when the trip day starts while a sheet is already up over a rested hub', async () => {
    mockPathname = HUB;
    await engineOn(false);
    const view = await renderUi(tree());
    await rest(2 * VISIT_CONSENT_CALM_MS);
    // The hub has rested; a sheet opens over it, and only then does the trip day begin.
    await view.rerender(tree(false, true));
    await act(() => engineOn(true));
    await rest(2 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
  });

  it('takes Turn on once and does not come back while the answer is on its way', async () => {
    mockPathname = HUB;
    await engineOn(true);
    await renderUi(tree());
    await rest(VISIT_CONSENT_CALM_MS + 100);
    await fireEvent.press(screen.getByTestId('visit-consent-accept'));
    expect(onAnswer.mock.calls).toEqual([[true]]);
    // The consent row has not synced back yet (`decided` is still false).
    await rest(5 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    expect(screen.queryByTestId('visit-consent-row')).toBeNull();
  });

  // Runs last: "Not now" is remembered on the device for the rest of this file.
  it('asks once: Not now is remembered, and the trip screen’s row brings the sheet back', async () => {
    mockPathname = HUB;
    await engineOn(true);
    const view = await renderUi(tree());
    expect(screen.queryByTestId('visit-consent-row')).toBeNull();
    await rest(VISIT_CONSENT_CALM_MS + 100);
    await fireEvent.press(screen.getByTestId('visit-consent-decline'));
    await rest(1000);
    expect(sheetUp()).toBe(false);
    expect(onAnswer).not.toHaveBeenCalled();

    // Later the same day, and after a relaunch: it does not rise again by itself.
    await rest(5 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);
    await view.unmount();
    await renderUi(tree());
    await rest(5 * VISIT_CONSENT_CALM_MS);
    expect(sheetUp()).toBe(false);

    // The row is the way back, from the same place.
    await fireEvent.press(screen.getByTestId('visit-consent-row-action'));
    await rest(100);
    await fireEvent.press(screen.getByTestId('visit-consent-accept'));
    expect(onAnswer.mock.calls).toEqual([[true]]);
  });
});
