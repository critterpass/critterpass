/**
 * The Android surfaces' permission state, read again whenever the app returns to the foreground:
 * every grant (exact alarms, full-screen alarms, promoted Live Updates, Do Not Disturb access) is
 * changed in system settings while the app is away. `null` on iOS and in binaries without the
 * module.
 */
import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { SettingsBanner, SurfacePermissionState } from './explainer-rows';

interface NativeAndroidSurfaces {
  permissionState(): SurfacePermissionState;
  openSettings(banner: SettingsBanner, channelId: string | null): boolean;
}

function surfaces(): NativeAndroidSurfaces | null {
  return requireOptionalNativeModule<NativeAndroidSurfaces>('CpAndroidSurfaces');
}

export interface AndroidSurfacePermissions {
  readonly state: SurfacePermissionState | null;
  /** Opens the system page that lifts [banner]; false when this Android has none. */
  readonly openSettings: (banner: SettingsBanner) => boolean;
}

function read(): SurfacePermissionState | null {
  try {
    return surfaces()?.permissionState() ?? null;
  } catch {
    return null;
  }
}

export function useAndroidSurfacePermissions(): AndroidSurfacePermissions {
  const [state, setState] = useState<SurfacePermissionState | null>(read);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setState(read());
    });
    return () => subscription.remove();
  }, []);

  const openSettings = useCallback(
    (banner: SettingsBanner) => surfaces()?.openSettings(banner, null) ?? false,
    [],
  );

  return { state, openSettings };
}
