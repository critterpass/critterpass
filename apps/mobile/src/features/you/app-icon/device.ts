/**
 * The home-screen icon on this device. The native module is looked up by name (features never
 * import native modules); without it (Jest, a binary made before the module) the device cannot
 * change its icon and the picker is not offered.
 */
import { requireOptionalNativeModule } from 'expo';

interface NativeAppIcon {
  isSupported(): Promise<boolean>;
  getCurrent(): Promise<string | null>;
  bundledNames(): string[];
  set(name: string | null): Promise<string | null>;
}

export interface AppIconDevice {
  /** Alternate icon names the app bundles; empty when the icon cannot change here. */
  readonly bundledNames: () => readonly string[];
  /** The native name of the icon showing now (`null` = the primary icon). */
  readonly getCurrent: () => Promise<string | null>;
  readonly set: (name: string | null) => Promise<void>;
}

function native(): NativeAppIcon | null {
  return requireOptionalNativeModule<NativeAppIcon>('CpAppIcon');
}

export const deviceAppIcon: AppIconDevice = {
  bundledNames: () => {
    try {
      return native()?.bundledNames() ?? [];
    } catch {
      return [];
    }
  },
  getCurrent: async () => (await native()?.getCurrent()) ?? null,
  set: async (name) => {
    const module = native();
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer error, never shown
    if (module === null) throw new Error('App icons are not available on this device');
    await module.set(name);
  },
};

/** Whether the app has other icons to switch to here (the Settings row shows only then). */
export function hasAlternateAppIcons(device: AppIconDevice = deviceAppIcon): boolean {
  return device.bundledNames().length > 0;
}
