/**
 * A tab's root (a screen in the tab navigator, or the first screen of a tab's stack) draws no back
 * control; a screen pushed in a tab's stack, or anywhere outside the tabs, does.
 */
import { describe, expect, it } from '@jest/globals';

import { isTabRootScreen } from '../tab-root';

describe('isTabRootScreen', () => {
  it('is a root for a screen directly in the tab navigator', () => {
    expect(
      isTabRootScreen({
        navigatorType: 'tab',
        parentType: 'stack',
        firstKey: 'home',
        routeKey: 'pass',
      }),
    ).toBe(true);
  });

  it('is a root only for the first screen of the stack a tab holds', () => {
    const inTabStack = { navigatorType: 'stack', parentType: 'tab', firstKey: 'wallet' };
    expect(isTabRootScreen({ ...inTabStack, routeKey: 'wallet' })).toBe(true);
    expect(isTabRootScreen({ ...inTabStack, routeKey: 'booking' })).toBe(false);
  });

  it('is never a root outside the tabs, even as the only screen in the stack', () => {
    expect(
      isTabRootScreen({
        navigatorType: 'stack',
        parentType: undefined,
        firstKey: 'settings',
        routeKey: 'settings',
      }),
    ).toBe(false);
  });
});
