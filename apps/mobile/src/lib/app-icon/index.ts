/**
 * The app icon catalogue on the device: catalogue keys (`face`, `passport.dark`) to the native
 * names cp-app-icon switches between (`passport-dark`: asset and activity-alias names cannot hold
 * a dot). PASSPORT in the automatic appearance is the primary icon and has no alternate name.
 */
import {
  DEFAULT_APP_ICON,
  appIconKey,
  parseAppIconKey,
  type AppIconAppearance,
  type AppIconBaseId,
} from '@cp/domain';

import {
  bundledAppIconNames,
  getCurrentAppIconName,
  isAppIconSupported,
  setAppIconName,
} from '../../../modules/cp-app-icon';

export { isAppIconSupported };

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

/** The catalogue key of the icon showing now. */
export async function getCurrentAppIcon(): Promise<string | null> {
  return iconKeyFromNativeName(await getCurrentAppIconName());
}

/**
 * Which icon/appearance keys this app can show: the primary icon plus every bundled alternate.
 * The icon picker offers an appearance only when it is here.
 */
export function bundledAppIcons(): ReadonlySet<string> {
  const keys = new Set<string>([appIconKey(DEFAULT_APP_ICON, 'auto')]);
  for (const name of bundledAppIconNames()) {
    const key = iconKeyFromNativeName(name);
    if (key !== null) keys.add(key);
  }
  return keys;
}

export async function setAppIcon(id: AppIconBaseId, appearance: AppIconAppearance): Promise<void> {
  await setAppIconName(nativeIconName(id, appearance));
}
