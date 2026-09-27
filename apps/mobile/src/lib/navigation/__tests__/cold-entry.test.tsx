import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router, useNavigationContainerRef } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';

import {
  clearSavedNavigation,
  isDeepLinkLaunch,
  readSavedNavigation,
  RESTORE_WINDOW_MS,
  shouldRestore,
  useNavigationPersistence,
  writeSavedNavigation,
} from '../restore';
import { registerScreens } from '../screen-registry';
import { openWithBackStack } from '../synthesize-stack';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

const BUILD = '1.0.0:embedded';
let launchUrl: string | null = null;
let clock = 1_000_000;

function Root() {
  const navigationRef = useNavigationContainerRef();
  useNavigationPersistence({ navigationRef, build: BUILD, launchUrl, now: () => clock });
  return <Stack screenOptions={{ headerShown: false }} />;
}

const named = (name: string) =>
  function Screen() {
    return <Text>{name}</Text>;
  };

const ROUTES = {
  _layout: Root,
  index: named('home'),
  when: named('when'),
  budget: named('budget'),
  draft: named('draft'),
};

async function renderApp() {
  const pending = renderRouter(ROUTES, { initialUrl: '/' });
  const rendered = await pending;
  // Restore waits one frame for the navigator to mount; renderRouter runs on fake timers.
  await act(() => {
    jest.runOnlyPendingTimers();
  });
  return { getPathname: () => pending.getPathname(), unmount: () => rendered.unmount() };
}

async function navigate(action: () => void) {
  await act(() => {
    action();
  });
  await act(async () => {});
}

let unregister: () => void = () => {};

beforeEach(() => {
  launchUrl = null;
  clock = 1_000_000;
  clearSavedNavigation();
  unregister = registerScreens({
    '3b-2': '/',
    '3c-3': '/when',
    '3c-5': '/budget',
    '3c-9': '/draft',
  });
});

afterEach(() => {
  unregister();
  jest.useRealTimers();
});

describe('openWithBackStack', () => {
  it('opens a screen cold and back walks its designed parents', async () => {
    const app = await renderApp();
    await navigate(() => openWithBackStack('3c-9'));
    expect(app.getPathname()).toBe('/draft');
    await navigate(() => router.back());
    expect(app.getPathname()).toBe('/budget');
    await navigate(() => router.back());
    expect(app.getPathname()).toBe('/when');
    await navigate(() => router.back());
    expect(app.getPathname()).toBe('/');
  });

  it('refuses an unregistered screen so the caller can fall back to home', async () => {
    await renderApp();
    expect(openWithBackStack('3k-10')).toBe(false);
  });
});

describe('navigation restore', () => {
  it('restores the saved stack on a plain cold start within 30 minutes', async () => {
    const first = await renderApp();
    await navigate(() => openWithBackStack('3c-9'));
    expect(readSavedNavigation()?.build).toBe(BUILD);
    await act(() => first.unmount());

    clock += RESTORE_WINDOW_MS - 1;
    const second = await renderApp();
    expect(second.getPathname()).toBe('/draft');
    await navigate(() => router.back());
    expect(second.getPathname()).toBe('/budget');
  });

  it('starts fresh once the saved state is 30 minutes old', async () => {
    const first = await renderApp();
    await navigate(() => openWithBackStack('3c-9'));
    await act(() => first.unmount());

    clock += RESTORE_WINDOW_MS;
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('leaves deep-link launches to the link router', async () => {
    const first = await renderApp();
    await navigate(() => openWithBackStack('3c-9'));
    await act(() => first.unmount());

    launchUrl = 'critterpass://p/kyoto';
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
  });
});

describe('restore rules', () => {
  const saved = { savedAt: 0, build: BUILD, state: {} };

  it('only restores fresh state from the same build on a plain launch', () => {
    expect(shouldRestore(saved, RESTORE_WINDOW_MS - 1, BUILD, null)).toBe(true);
    expect(shouldRestore(saved, RESTORE_WINDOW_MS, BUILD, null)).toBe(false);
    expect(shouldRestore(saved, 10, '2.0.0:embedded', null)).toBe(false);
    expect(shouldRestore(undefined, 10, BUILD, null)).toBe(false);
    expect(shouldRestore(saved, -1, BUILD, null)).toBe(false);
  });

  it('tells deep links from plain launches', () => {
    expect(isDeepLinkLaunch(null)).toBe(false);
    expect(isDeepLinkLaunch('critterpass://')).toBe(false);
    expect(isDeepLinkLaunch('critterpass://p/kyoto')).toBe(true);
    expect(isDeepLinkLaunch('https://critterpass.app/i/ABCD')).toBe(true);
    expect(isDeepLinkLaunch('exp+critterpass://expo-development-client/?url=x')).toBe(false);
    expect(isDeepLinkLaunch('not a url')).toBe(false);
  });

  it('ignores corrupted saved state', () => {
    writeSavedNavigation(saved);
    expect(readSavedNavigation()).toEqual(saved);
    clearSavedNavigation();
    expect(readSavedNavigation()).toBeUndefined();
  });
});
