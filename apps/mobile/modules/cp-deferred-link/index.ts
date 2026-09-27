import { Platform } from 'react-native';

import { nativeCpDeferredLinkModule } from './src/CpDeferredLinkModule';

/**
 * Android only: the Play Install Referrer, read once per install (later calls resolve null), or
 * null when unavailable. Never throws: a missing referrer just means no deferred link.
 */
export async function getInstallReferrer(): Promise<string | null> {
  if (Platform.OS !== 'android' || nativeCpDeferredLinkModule === null) return null;
  try {
    return await nativeCpDeferredLinkModule.getInstallReferrer();
  } catch {
    return null;
  }
}

/**
 * iOS only: whether the pasteboard probably holds a link, checked without reading it (no paste
 * alert). True means "offer the paste control", never that a link was read.
 */
export async function detectLikelyLink(): Promise<boolean> {
  if (Platform.OS !== 'ios' || nativeCpDeferredLinkModule === null) return false;
  try {
    return await nativeCpDeferredLinkModule.detectLikelyLink();
  } catch {
    return false;
  }
}

/**
 * Android internal builds only: a referrer a test run passed as the `cp_install_referrer` launch
 * extra, standing in for Play's. Callers must not use it in the production variant.
 */
export async function getReferrerOverride(): Promise<string | null> {
  if (Platform.OS !== 'android' || nativeCpDeferredLinkModule === null) return null;
  try {
    return await nativeCpDeferredLinkModule.getReferrerOverride();
  } catch {
    return null;
  }
}
