/**
 * Whether this build carries the native code the premium UI needs. JS updates reach builds made
 * before `@expo/ui` and `react-native-keyboard-controller` were added (and the e2e build runs each
 * commit's JS on an older binary), so the premium UI turns itself off there instead of calling
 * native views that do not exist. Neither library is imported here: importing either one on such a
 * build already reaches for its native side.
 */
import { requireOptionalNativeModule } from 'expo';
import { TurboModuleRegistry } from 'react-native';

export interface NativeModuleProbe {
  /** An Expo module by its native name, or null when the build lacks it. */
  readonly expoModule: (name: string) => unknown;
  /** A React Native (turbo) module by its native name, or null when the build lacks it. */
  readonly turboModule: (name: string) => unknown;
}

/** `@expo/ui`'s module (SwiftUI / Compose hosts, Android `Stack.Toolbar`). */
export const EXPO_UI_MODULE = 'ExpoUI';
/** `react-native-keyboard-controller`'s module. */
export const KEYBOARD_CONTROLLER_MODULE = 'KeyboardController';

const deviceProbe: NativeModuleProbe = {
  expoModule: (name) => requireOptionalNativeModule(name),
  turboModule: (name) => TurboModuleRegistry.get(name),
};

/** Both premium native modules are in the build. */
export function probePremiumNativeModules(probe: NativeModuleProbe = deviceProbe): boolean {
  return (
    probe.expoModule(EXPO_UI_MODULE) != null &&
    probe.turboModule(KEYBOARD_CONTROLLER_MODULE) != null
  );
}

let ready: boolean | undefined;

/** Read once per launch: a build's native modules never change while it runs. */
export function premiumNativeModulesReady(): boolean {
  ready ??= probePremiumNativeModules();
  return ready;
}

/** Whether the keyboard controller alone is in the build (the shell's keyboard pieces need only it). */
export function keyboardControllerReady(probe: NativeModuleProbe = deviceProbe): boolean {
  return probe.turboModule(KEYBOARD_CONTROLLER_MODULE) != null;
}
