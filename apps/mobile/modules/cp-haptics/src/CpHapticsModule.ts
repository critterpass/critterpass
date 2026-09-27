import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The native binding (Swift `CHHapticEngine` / Kotlin `VibrationEffect.Composition`). Declared as a
 * class extending `NativeModule` per the Expo Modules API convention; `requireOptionalNativeModule`
 * below resolves it to `null` rather than throwing when the native module isn't linked (a Jest
 * environment, or a platform build that hasn't run `pod install`/Gradle sync yet) — the JS API's
 * `isSupported()` treats that the same as "no haptics engine on this device".
 */
export declare class NativeCpHapticsModule extends NativeModule {
  /** True when the device has a haptics engine capable of continuous ramps and long patterns (Core Haptics / Android API level with `VibrationEffect.Composition`). */
  isSupported(): boolean;
  /** Plays a discrete named pattern (currently just `'sos'`) generated from `sound.tokens.json`. */
  play(patternId: string): void;
  /** Starts a continuous intensity ramp (0–1), throttled to 30 Hz by the native side. */
  rampStart(): void;
  rampUpdate(intensity: number): void;
  rampStop(): void;
}

export const nativeCpHapticsModule =
  requireOptionalNativeModule<NativeCpHapticsModule>('CpHaptics');
