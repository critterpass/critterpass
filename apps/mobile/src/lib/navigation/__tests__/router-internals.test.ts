/** Expo Router's private pieces are still where the app reads them (a new SDK fails here first). */
import { describe, expect, it } from '@jest/globals';

import { navigationRef, ScreenPresentationContext, useIsRouteFocused } from '../router-internals';

describe('router internals', () => {
  it('finds the screen presentation context, the route focus hook and the navigation ref', () => {
    expect(ScreenPresentationContext).toBeDefined();
    expect(typeof useIsRouteFocused).toBe('function');
    expect(navigationRef).toBeDefined();
  });
});
