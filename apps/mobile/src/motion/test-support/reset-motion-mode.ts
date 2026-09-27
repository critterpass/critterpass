import { act, renderHook } from '@testing-library/react-native';

import { useMotionMode } from '../motion-mode';

/**
 * `react-native-mmkv`'s test-mode mock is an in-memory store that persists across every test in a
 * file (it is not reset between renders the way component state is) — call this in an async
 * `beforeEach` whenever a test suite reads or writes the in-app motion mode override, so one test
 * setting `'reduced'` cannot silently change another's effective motion mode. Goes through the
 * public `useMotionMode` hook itself (rather than reaching into MMKV internals) so it is guaranteed
 * to reset the exact storage the app reads.
 */
export async function resetMotionModeForTests(): Promise<void> {
  const { result, unmount } = await renderHook(() => useMotionMode());
  await act(() => {
    result.current[1]('full');
  });
  await unmount();
}
