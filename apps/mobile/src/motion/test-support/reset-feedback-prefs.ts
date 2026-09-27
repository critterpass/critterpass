import { act, renderHook } from '@testing-library/react-native';

import { useFeedbackPrefs } from '../feedback/prefs';

/**
 * `react-native-mmkv`'s test-mode mock persists across every test in a file (see
 * `reset-motion-mode.ts`'s own comment) — call this in an async `beforeEach` whenever a test suite
 * reads or writes `cp.motion.*` prefs. Goes through the public `useFeedbackPrefs` hook so it is
 * guaranteed to reset the exact storage `getFeedbackPrefsSnapshot()` reads.
 */
export async function resetFeedbackPrefsForTests(): Promise<void> {
  const { result, unmount } = await renderHook(() => useFeedbackPrefs());
  await act(() => {
    result.current.setHapticsEnabled(true);
    result.current.setMusicEnabled(true);
    result.current.setMusicVolume(0.8);
    result.current.setEffectsVolume(0.8);
    result.current.setQuietOnTheRoad(true);
    result.current.setCategoryEnabled('stickers-and-stamps', true);
    result.current.setCategoryEnabled('critter-voices', true);
  });
  await unmount();
}
