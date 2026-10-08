/**
 * The year-later memory over the real local-first stack, opened for a memory this phone does not
 * have (removed, or a link that arrived before its trip synced): "not here" with a way back, never
 * an endless wait.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { TRIP } from '../../dev/recap-fixtures';
import { renderRecap, seedTrip, until } from '../../test-support/recap-harness';
import { MemoryScreen } from '../memory-screen';

const UNKNOWN = '0192f000-0000-7000-8000-00000000dead';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  (router.replace as jest.Mock).mockClear();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('year-later memory', () => {
  it('says a memory that is not on this phone is not here, and goes Home from a cold open', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedTrip(stack);
    await renderRecap(<MemoryScreen memoryId={UNKNOWN} tripId={TRIP} />, stack);
    await until(() => screen.queryByTestId('memory-missing') !== null);
    await fireEvent.press(screen.getByTestId('memory-missing-back'));
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });

  it('does the same for a link that names no trip', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderRecap(<MemoryScreen memoryId={UNKNOWN} tripId={null} />, stack);
    await until(() => screen.queryByTestId('memory-missing') !== null);
    expect(screen.queryByTestId('memory-waiting')).toBeNull();
  });
});
