/**
 * Runs in every suite before its own file: the doubles nearly every screen suite needs, registered
 * once. A suite that needs the real module opts out with `jest.unmock('<module>')` (the CanvasKit
 * and sticker drawing suites, the suites that mount real routes); a suite that needs a different
 * double calls `jest.mock` itself, which replaces the one registered here.
 */
import { afterEach, jest } from '@jest/globals';

import type * as RouterDouble from './src/lib/navigation/test-support/expo-router-double';

// Set when a suite first loads the router double, so suites that never touch it pay nothing.
let mockResetRouter: (() => void) | undefined;

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   jest.mock factories cannot close over module-scope imports; each double's header says why the
   real module cannot run under Jest. */
jest.mock('@shopify/react-native-skia', () => require('./src/ui/test-support/skia-double'));
jest.mock('./src/ui/sticker/Sticker', () => require('./src/ui/avatar/test-support/sticker-double'));
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */
jest.mock('expo-router', () => {
  const double = jest.requireActual<typeof RouterDouble>(
    './src/lib/navigation/test-support/expo-router-double',
  );
  mockResetRouter = double.resetExpoRouterDouble;
  return double;
});

// Not a database mock: PowerSync's SDK loaded by Node's own loader, so app code and the real Node
// database under test share one copy (see node-realm's header).
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('./src/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

afterEach(() => {
  mockResetRouter?.();
});
