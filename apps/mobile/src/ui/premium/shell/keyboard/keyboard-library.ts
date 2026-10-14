/**
 * The keyboard controller library, loaded only on builds that carry its native module (loading it
 * on an older build already calls into native code that is missing there).
 */
import type * as KeyboardControllerModule from 'react-native-keyboard-controller';
import { TurboModuleRegistry } from 'react-native';

/** Whether the build carries the keyboard controller's native module. */
function keyboardControllerReady(): boolean {
  return TurboModuleRegistry.get('KeyboardController') != null;
}

export type KeyboardController = typeof KeyboardControllerModule;

let controller: KeyboardController | null | undefined;

/** The library, or null on a build without its native module. */
export function keyboardController(): KeyboardController | null {
  if (controller === undefined) {
    controller = keyboardControllerReady()
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
        (require('react-native-keyboard-controller') as KeyboardController)
      : null;
  }
  return controller;
}
