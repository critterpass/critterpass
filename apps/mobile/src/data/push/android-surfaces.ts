/**
 * What the Android surfaces (Live Updates, notification buttons, widgets) need from the app's
 * session: the device action key imported into the Keystore, where the notification and widget
 * buttons sign with it, and whether this phone can show a Live Update at all, which the server
 * reads before starting one. The module is looked up by name and is absent on iOS, in Jest and
 * in binaries built before it existed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: module and storage names. */
import { requireOptionalNativeModule } from 'expo';

import type { ActionKeyStorage, StoredActionKey } from './action-key';
import type { DeviceCapabilities } from './register';

export interface AndroidSurfacesNative {
  importActionKey(json: string): Promise<boolean>;
  revokeActionKey(): void;
  actionKeyInfo(): { readonly keyId: string } | null;
  permissionState(): { readonly liveUpdatePath: 'promoted' | 'ongoing' | 'none' };
}

export function androidSurfacesNative(): AndroidSurfacesNative | null {
  return requireOptionalNativeModule<AndroidSurfacesNative>('CpAndroidSurfaces');
}

/** Forgets the Keystore key and its record (sign-out, account deletion); no-op without the module. */
export async function clearAndroidActionKey(record: ActionKeyStorage): Promise<void> {
  const native = androidSurfacesNative();
  if (native !== null) await androidActionKeyStorage(native, record).remove();
}

/**
 * Live Updates reach this phone: promoted on Android 16, an ongoing notification below it or
 * with promotion off, nothing while notifications are off. Empty without the module.
 */
export function androidCapabilities(native: AndroidSurfacesNative | null): DeviceCapabilities {
  if (native === null) return {};
  try {
    return { live_updates: native.permissionState().liveUpdatePath !== 'none' };
  } catch {
    return {};
  }
}

/**
 * The action key on Android: the secret goes into the Keystore, which never gives it back, so
 * the record kept beside it (`record`) holds everything but the secret, enough to tell whose key
 * it is and when to rotate. A record whose key the Keystore no longer holds reads as no key.
 */
export function androidActionKeyStorage(
  native: AndroidSurfacesNative,
  record: ActionKeyStorage,
): ActionKeyStorage {
  return {
    async read() {
      const raw = await record.read();
      if (raw === null) return null;
      try {
        const kept = JSON.parse(raw) as Partial<StoredActionKey>;
        return native.actionKeyInfo()?.keyId === kept.key_id ? raw : null;
      } catch {
        return null;
      }
    },
    async write(value) {
      if (!(await native.importActionKey(value))) throw new Error('action key import failed');
      const key = JSON.parse(value) as StoredActionKey;
      await record.write(JSON.stringify({ ...key, secret: '' }));
    },
    async remove() {
      native.revokeActionKey();
      await record.remove();
    },
  };
}
