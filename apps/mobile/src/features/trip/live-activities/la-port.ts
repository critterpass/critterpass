/**
 * What the Live Activity features need from the device: the `CpLiveActivity` native module
 * (modules/cp-live-activity, iOS), looked up by name so a binary without it (older builds,
 * Android, web) simply has no port.
 */
import { requireOptionalNativeModule } from 'expo';

export type LaDeviceState = 'active' | 'stale' | 'ended' | 'dismissed';

export interface LaDeviceActivity {
  /** ActivityKit's id for the activity on this phone. */
  readonly id: string;
  readonly kind: string;
  /** The static attributes, in the domain's wire shape. */
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface LaPort {
  authorization(): { readonly enabled: boolean; readonly frequent: boolean };
  onPushToStartToken(
    listener: (event: { readonly kind: string; readonly token: string }) => void,
  ): { remove(): void };
  onUpdateToken(listener: (event: LaDeviceActivity & { readonly token: string }) => void): {
    remove(): void;
  };
  onActivityState(
    listener: (event: LaDeviceActivity & { readonly state: LaDeviceState }) => void,
  ): { remove(): void };
}

interface NativeLaModule {
  authorization(): { readonly enabled: boolean; readonly frequent: boolean };
  addListener(event: string, listener: (event: never) => void): { remove(): void };
}

let installed: LaPort | null | undefined;

/** The port over the installed module (the same object every call), or `null` without it. */
export function installedLaPort(): LaPort | null {
  if (installed !== undefined) return installed;
  const native = requireOptionalNativeModule<NativeLaModule>('CpLiveActivity');
  installed =
    native === null
      ? null
      : {
          authorization: () => native.authorization(),
          onPushToStartToken: (listener) => native.addListener('onPushToStartToken', listener),
          onUpdateToken: (listener) => native.addListener('onUpdateToken', listener),
          onActivityState: (listener) => native.addListener('onActivityState', listener),
        };
  return installed;
}
