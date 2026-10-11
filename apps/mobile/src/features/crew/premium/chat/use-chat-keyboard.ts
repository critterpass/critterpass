/**
 * The keyboard's animated height for the chat (positive while it is up), so the timeline shrinks
 * with it and the sticker tray can take its place at the same height. On builds with the keyboard
 * controller it reads its frame-accurate animation (interactive dismissal included); older builds
 * fall back to Reanimated's own keyboard tracking. Which one is fixed per launch.
 */
import type * as KeyboardControllerModule from 'react-native-keyboard-controller';
import { useAnimatedKeyboard, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { keyboardControllerReady } from '@/lib/premium-ui';

type KeyboardController = typeof KeyboardControllerModule;

const library: KeyboardController | null = keyboardControllerReady()
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
    (require('react-native-keyboard-controller') as KeyboardController)
  : null;

function useControllerHeight(): SharedValue<number> {
  // `library` is set whenever this hook is the one in use.
  const { height } = (library as KeyboardController).useReanimatedKeyboardAnimation();
  return useDerivedValue(() => Math.abs(height.value));
}

function useFallbackHeight(): SharedValue<number> {
  const keyboard = useAnimatedKeyboard();
  return useDerivedValue(() => keyboard.height.value);
}

export const useChatKeyboardHeight: () => SharedValue<number> =
  library === null ? useFallbackHeight : useControllerHeight;
