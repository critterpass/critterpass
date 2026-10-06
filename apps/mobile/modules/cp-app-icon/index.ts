import { nativeCpAppIconModule } from './src/CpAppIconModule';

/**
 * The home-screen app icon by native name: an alternate icon the app bundles, or `null` for the
 * primary icon. iOS switches with `setAlternateIconName`, Android by enabling one launcher
 * activity-alias. The catalogue keys live in src/lib/app-icon.
 */
export async function isAppIconSupported(): Promise<boolean> {
  if (!nativeCpAppIconModule) return false;
  try {
    return await nativeCpAppIconModule.isSupported();
  } catch {
    return false;
  }
}

/** The native name of the icon showing now (`null` = primary); the device is the truth. */
export async function getCurrentAppIconName(): Promise<string | null> {
  return nativeCpAppIconModule ? nativeCpAppIconModule.getCurrent() : null;
}

/** Every alternate icon name the app ships. */
export function bundledAppIconNames(): readonly string[] {
  return nativeCpAppIconModule?.bundledNames() ?? [];
}

/** Switches the home-screen icon; rejects when the device cannot or the name is not bundled. */
export async function setAppIconName(name: string | null): Promise<void> {
  if (!nativeCpAppIconModule) throw new Error('App icons are not available on this device');
  await nativeCpAppIconModule.set(name);
}
