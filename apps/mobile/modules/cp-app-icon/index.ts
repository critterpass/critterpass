import {
  DEFAULT_APP_ICON,
  appIconKey,
  parseAppIconKey,
  type AppIconAppearance,
  type AppIconBaseId,
} from '@cp/domain';

import { nativeCpAppIconModule } from './src/CpAppIconModule';

/**
 * The home-screen app icon. Icon keys are the catalogue's (`face`, `passport.dark`); the native
 * names are the same with the appearance joined by a hyphen (`passport-dark`), because asset and
 * activity-alias names cannot hold a dot. PASSPORT in the automatic appearance is the primary icon
 * and has no alternate name.
 */
export function nativeIconName(id: AppIconBaseId, appearance: AppIconAppearance): string | null {
  if (id === DEFAULT_APP_ICON && appearance === 'auto') return null;
  return appIconKey(id, appearance).replace('.', '-');
}

/** The catalogue key for a native name (`null` = the primary icon); unknown names read as `null`. */
export function iconKeyFromNativeName(name: string | null): string | null {
  if (name === null) return appIconKey(DEFAULT_APP_ICON, 'auto');
  if (parseAppIconKey(name) !== null) return name;
  // Base ids carry hyphens of their own (`home-set`): only the last hyphen can join an appearance.
  const last = name.lastIndexOf('-');
  if (last < 0) return null;
  const key = `${name.slice(0, last)}.${name.slice(last + 1)}`;
  return parseAppIconKey(key) !== null ? key : null;
}

export async function isAppIconSupported(): Promise<boolean> {
  if (!nativeCpAppIconModule) return false;
  try {
    return await nativeCpAppIconModule.isSupported();
  } catch {
    return false;
  }
}

/** The catalogue key of the icon showing now; the device, not the server, is the truth. */
export async function getCurrentAppIcon(): Promise<string | null> {
  if (!nativeCpAppIconModule) return null;
  return iconKeyFromNativeName(await nativeCpAppIconModule.getCurrent());
}

/**
 * Which icon/appearance pairs this binary can show: the primary icon plus every bundled alternate.
 * The icon screen offers an appearance only when it is here.
 */
export function bundledAppIcons(): ReadonlySet<string> {
  const keys = new Set<string>([appIconKey(DEFAULT_APP_ICON, 'auto')]);
  for (const name of nativeCpAppIconModule?.bundledNames() ?? []) {
    const key = iconKeyFromNativeName(name);
    if (key !== null) keys.add(key);
  }
  return keys;
}

/** Switches the home-screen icon; rejects when the device cannot or the icon is not bundled. */
export async function setAppIcon(id: AppIconBaseId, appearance: AppIconAppearance): Promise<void> {
  if (!nativeCpAppIconModule) throw new Error('App icons are not available on this device');
  await nativeCpAppIconModule.set(nativeIconName(id, appearance));
}
