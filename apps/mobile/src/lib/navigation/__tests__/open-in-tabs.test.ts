/**
 * A tab destination opened from a page outside the tabs first goes down to the tabs and then
 * navigates inside them, so a second tab navigator is never stacked; from inside the tabs it only
 * navigates. A link of unknown shape takes that path only when the tabs own it.
 */
jest.mock('expo-router/build/global-state/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), getRootState: jest.fn() },
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { navigationRef } from 'expo-router/build/global-state/navigationRef';

import { insideTabs, isTabHref, openInTabs, openLink, type RootRoutes } from '../open-in-tabs';

const mockRouter = jest.mocked(router);
const mockRef = jest.mocked(navigationRef);

const IN_TABS = { index: 0, routes: [{ name: '(tabs)' }] };
const ON_A_PUSHED_PAGE = { index: 1, routes: [{ name: '(tabs)' }, { name: 'you' }] };

/** The root state as the router holds it: the root stack is the child of its `__root` wrapper. */
const wrapped = (state: RootRoutes) => ({ index: 0, routes: [{ name: '__root', state }] });

function showing(state: RootRoutes) {
  mockRef.getRootState.mockReturnValue(wrapped(state) as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRef.isReady.mockReturnValue(true);
});

describe('openInTabs', () => {
  it('dismisses to the tabs, then navigates, from a page outside them', () => {
    showing(ON_A_PUSHED_PAGE);
    openInTabs('/wallet/bookings/b1');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.navigate).toHaveBeenCalledWith('/wallet/bookings/b1');
    expect(mockRouter.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouter.navigate.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('only navigates from a screen inside the tabs', () => {
    showing(IN_TABS);
    openInTabs('/trips/t1');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith('/trips/t1');
  });

  it('puts the tabs in place first when the navigator has no state to read yet', () => {
    mockRef.isReady.mockReturnValue(false);
    openInTabs('/pass');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.navigate).toHaveBeenCalledWith('/pass');
  });
});

describe('openLink', () => {
  it('opens a tab destination inside the tabs', () => {
    showing(ON_A_PUSHED_PAGE);
    openLink('/trips/t1/day/2?focus=stop');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.navigate).toHaveBeenCalledWith('/trips/t1/day/2?focus=stop');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('pushes anything the tabs do not own', () => {
    showing(IN_TABS);
    openLink('/crew/c1/chat');
    expect(mockRouter.push).toHaveBeenCalledWith('/crew/c1/chat');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});

describe('isTabHref', () => {
  it.each(['/', '/trips', '/trips/t1/day/2', '/wallet/money?tab=owed', '/pass', '/(tabs)/wallet'])(
    'counts %s as a tab destination',
    (href) => expect(isTabHref(href)).toBe(true),
  );

  it.each(['/inbox', '/tripsy', '/passport/stamps', '/crew/c1/chat', '/go?trip=t1', '/you/wallet'])(
    'leaves %s to an ordinary push',
    (href) => expect(isTabHref(href)).toBe(false),
  );
});

describe('insideTabs', () => {
  it('reads the route in front, not the ones under it', () => {
    expect(insideTabs(IN_TABS)).toBe(true);
    expect(insideTabs(ON_A_PUSHED_PAGE)).toBe(false);
    expect(insideTabs(undefined)).toBe(false);
  });

  it('looks through the wrapper the router puts around the root stack', () => {
    expect(insideTabs(wrapped(IN_TABS))).toBe(true);
    expect(insideTabs(wrapped(ON_A_PUSHED_PAGE))).toBe(false);
    expect(insideTabs({ index: 0, routes: [{ name: '__root' }] })).toBe(false);
  });
});
