/**
 * The app icon catalogue on the device: catalogue keys (`face`, `passport.dark`) to the native
 * names cp-app-icon switches between (`passport-dark`: asset and activity-alias names cannot hold
 * a dot). PASSPORT in the automatic appearance is the primary icon and has no alternate name.
 * Pure: the route hands the native module's functions to the screen.
 */
import {
  DEFAULT_APP_ICON,
  appIconKey,
  parseAppIconKey,
  type AppIconAppearance,
  type AppIconBaseId,
} from '@cp/domain';

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

/**
 * Which icon/appearance keys the app can show, from the bundled alternate names: the primary icon
 * plus every alternate it understands. The icon picker offers an appearance only when it is here.
 */
export function bundledAppIconKeys(nativeNames: readonly string[]): ReadonlySet<string> {
  const keys = new Set<string>([appIconKey(DEFAULT_APP_ICON, 'auto')]);
  for (const name of nativeNames) {
    const key = iconKeyFromNativeName(name);
    if (key !== null) keys.add(key);
  }
  return keys;
}
