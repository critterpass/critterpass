jest.unmock('expo-router');

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { Redirect, router, useNavigationContainerRef } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useSyncExternalStore } from 'react';
import { Text } from 'react-native';

import { provideSessionGate, type SessionGateState } from '../gates';
import {
  clearSavedNavigation,
  decideRestore,
  focusedPath,
  forgetNavigationForAccountSwitch,
  isLinkLaunch,
  leftLaunchScreen,
  readSavedNavigation,
  resetAccountSwitchForTests,
  RESTORE_WINDOW_MS,
  setSessionReady,
  shouldRestore,
  useNavigationPersistence,
  writeSavedNavigation,
} from '../restore';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

const BUILD = '1.0.0:embedded';
let launchUrl: string | null = null;
let clock = 1_000_000;

// The session: its local database opens some time after launch, and its gate opens at sign-in.
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
const gate = store<SessionGateState>({ status: 'ready' });
provideSessionGate(() => useSyncExternalStore(gate.subscribe, gate.get));

function Root() {
  const navigationRef = useNavigationContainerRef();
  useNavigationPersistence({
    navigationRef,
    build: BUILD,
    launchUrl,
    now: () => clock,
  });
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
  // A sheet over the stack, and a screen that happens once.
  '(modal)/_layout': function ModalGroup() {
    return <Stack screenOptions={{ headerShown: false, presentation: 'transparentModal' }} />;
  },
  '(modal)/guide': named('guide sheet'),
  'account-closed': named('account closed'),
};

// The same app with Home inside a group, as the tabs are: the group's navigator mounts inside the
// root's and fills in its own first screen while the launch settles.
const GROUPED_ROUTES = {
  _layout: Root,
  // `/` sends the launch on to the tabs, as the app's root index does.
  index: function RootIndex() {
    return <Redirect href="/(tabs)" />;
  },
  '(tabs)/_layout': function Tabs() {
    return <Stack screenOptions={{ headerShown: false }} />;
  },
  '(tabs)/index': named('home'),
  when: named('when'),
  budget: named('budget'),
  draft: named('draft'),
};

async function renderApp(routes: typeof ROUTES | typeof GROUPED_ROUTES = ROUTES) {
  const pending = renderRouter(routes, { initialUrl: '/' });
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

/** Three pages deep, as a person gets there: Home, then When, Budget and the draft pushed in turn. */
function openDraft() {
  router.push('/when');
  router.push('/budget');
  router.push('/draft');
}

beforeEach(() => {
  launchUrl = null;
  clock = 1_000_000;
  setSessionReady(true);
  gate.set({ status: 'ready' });
  clearSavedNavigation();
  resetAccountSwitchForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('navigation restore', () => {
  it('restores the saved stack on a plain cold start within 30 minutes', async () => {
    const first = await renderApp();
    await navigate(openDraft);
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
    await navigate(openDraft);
    await act(() => first.unmount());

    clock += RESTORE_WINDOW_MS;
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('leaves deep-link launches to the link router', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    await act(() => first.unmount());

    launchUrl = 'critterpass://p/kyoto';
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
  });

  it('opens Home for a bare app link, not the saved screens', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    await act(() => first.unmount());

    launchUrl = 'critterpass://';
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('opens Home after an account switch, not the screens of the account before', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    forgetNavigationForAccountSwitch();
    expect(readSavedNavigation()).toBeUndefined();
    // The switch restarts the app; a move before the restart is not saved either.
    await navigate(() => router.push('/when'));
    expect(readSavedNavigation()).toBeUndefined();
    await act(() => first.unmount());

    resetAccountSwitchForTests();
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    // The new session saves its screens again.
    await navigate(() => router.push('/budget'));
    expect(readSavedNavigation()?.build).toBe(BUILD);
  });

  it('waits for the session database to open, then restores', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    await act(() => first.unmount());

    setSessionReady(false);
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    await act(() => {
      setSessionReady(true);
    });
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(second.getPathname()).toBe('/draft');
    await navigate(() => router.back());
    expect(second.getPathname()).toBe('/budget');
  });

  it('restores when the launch redirects and settles on its first screen before the database opens', async () => {
    const first = await renderApp(GROUPED_ROUTES);
    await navigate(openDraft);
    await act(() => first.unmount());

    setSessionReady(false);
    const second = await renderApp(GROUPED_ROUTES);
    expect(second.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
    await act(() => {
      setSessionReady(true);
    });
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(second.getPathname()).toBe('/draft');
  });

  it('leaves a person who moved on before the database opened where they went', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    await act(() => first.unmount());

    setSessionReady(false);
    const second = await renderApp();
    await navigate(() => router.push('/when'));
    await act(() => {
      setSessionReady(true);
    });
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(second.getPathname()).toBe('/when');
    expect(screen.getByText('when')).toBeTruthy();
  });

  it('reopens the page under a sheet, never the sheet', async () => {
    const first = await renderApp();
    await navigate(() => router.push('/when'));
    await navigate(() => router.push('/guide'));
    expect(first.getPathname()).toBe('/guide');
    await act(() => first.unmount());

    const second = await renderApp();
    expect(second.getPathname()).toBe('/when');
    expect(screen.queryByText('guide sheet')).toBeNull();
    await navigate(() => router.back());
    expect(second.getPathname()).toBe('/');
  });

  it('opens Home when the only screen left was one that happens once', async () => {
    const first = await renderApp();
    await navigate(() => router.replace('/account-closed'));
    expect(first.getPathname()).toBe('/account-closed');
    expect(readSavedNavigation()).toBeUndefined();
    await act(() => first.unmount());

    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
  });

  it('never restores into a signed-out launch and saves nothing until sign-in', async () => {
    const first = await renderApp();
    await navigate(openDraft);
    await act(() => first.unmount());

    gate.set({ status: 'onboarding' });
    const second = await renderApp();
    expect(second.getPathname()).toBe('/');
    expect(readSavedNavigation()).toBeUndefined();
    await navigate(() => router.push('/when'));
    expect(readSavedNavigation()).toBeUndefined();

    await act(() => {
      gate.set({ status: 'ready' });
    });
    await navigate(() => router.push('/budget'));
    expect(readSavedNavigation()?.build).toBe(BUILD);
    await act(() => second.unmount());

    const third = await renderApp();
    expect(third.getPathname()).toBe('/budget');
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

  it('waits for the gate and the database, and gives way to a person who moved', () => {
    const moment = {
      gate: 'ready' as const,
      sessionReady: true,
      navigated: false,
      saved,
      now: 10,
      build: BUILD,
      launchUrl: null,
    };
    expect(decideRestore(moment)).toBe('restore');
    expect(decideRestore({ ...moment, sessionReady: false })).toBe('wait');
    expect(decideRestore({ ...moment, gate: 'loading' })).toBe('wait');
    expect(decideRestore({ ...moment, navigated: true, sessionReady: false })).toBe('skip');
    expect(decideRestore({ ...moment, gate: 'signedOut' })).toBe('skip');
    expect(decideRestore({ ...moment, gate: 'onboarding' })).toBe('skip');
    // Nothing worth restoring is decided at once, without waiting for the database.
    expect(decideRestore({ ...moment, sessionReady: false, saved: undefined })).toBe('skip');
  });

  it('reads the focused screens from a state, mounted or not', () => {
    const tabs = { index: 1, routes: [{ name: 'index' }, { name: 'wallet' }] };
    expect(focusedPath({ index: 0, routes: [{ name: '(tabs)', state: tabs }] })).toEqual([
      '(tabs)',
      'wallet',
    ]);
    // Not yet taken up by its navigator: no index, the last route is the focused one.
    expect(focusedPath({ routes: [{ name: '(tabs)' }, { name: 'crew' }] })).toEqual(['crew']);
    expect(focusedPath(undefined)).toEqual([]);
  });

  it('tells a launch settling from a person moving', () => {
    const tabs = (index: number) => ({
      index,
      routes: [{ name: 'index' }, { name: 'trips' }, { name: 'wallet' }],
    });
    // Navigators mount one inside the other and fill in their own first screen.
    expect(
      leftLaunchScreen(['(tabs)'], { index: 0, routes: [{ name: '(tabs)', state: tabs(0) }] }),
    ).toBe(false);
    expect(leftLaunchScreen([], { index: 0, routes: [{ name: '(tabs)' }] })).toBe(false);
    // `/` redirects to the tabs: the root's `index` is replaced, not left behind.
    expect(
      leftLaunchScreen(['index'], { index: 0, routes: [{ name: '(tabs)', state: tabs(0) }] }),
    ).toBe(false);
    // Another tab: Home is still there, beside it.
    expect(
      leftLaunchScreen(['(tabs)', 'index'], {
        index: 0,
        routes: [{ name: '(tabs)', state: tabs(2) }],
      }),
    ).toBe(true);
    // A screen pushed over the tabs.
    expect(
      leftLaunchScreen(['(tabs)', 'index'], {
        index: 1,
        routes: [{ name: '(tabs)', state: tabs(0) }, { name: 'crew' }],
      }),
    ).toBe(true);
  });

  it('tells link launches, bare or with a path, from plain launches', () => {
    expect(isLinkLaunch(null)).toBe(false);
    expect(isLinkLaunch('critterpass://')).toBe(true);
    expect(isLinkLaunch('critterpass://p/kyoto')).toBe(true);
    expect(isLinkLaunch('https://critterpass.app/i/ABCD')).toBe(true);
    expect(isLinkLaunch('exp+critterpass://expo-development-client/?url=x')).toBe(false);
    expect(isLinkLaunch('not a url')).toBe(false);
  });

  it('ignores corrupted saved state', () => {
    writeSavedNavigation(saved);
    expect(readSavedNavigation()).toEqual(saved);
    clearSavedNavigation();
    expect(readSavedNavigation()).toBeUndefined();
  });
});
