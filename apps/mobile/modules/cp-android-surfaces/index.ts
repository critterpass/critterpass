/**
 * Android off-app surfaces (Live Updates, notification actions, the SOS channel, Glance widgets,
 * the lock-screen hub and dream, widget pinning). Every call is safe without the native module
 * (iOS, Jest, older binaries): `getAndroidSurfaces()` is then `null`.
 */
import {
  nativeCpAndroidSurfacesModule,
  type NativeActionKeyInfo,
  type NativeCpAndroidSurfacesModule,
  type NativeInstalledWidget,
  type NativeSettingsBanner,
  type NativeSurfacePermissionState,
  type NativeWidgetSupport,
} from './src/CpAndroidSurfacesModule';

export type {
  NativeActionKeyInfo as ActionKeyInfo,
  NativeInstalledWidget as InstalledWidget,
  NativeSettingsBanner as SettingsBanner,
  NativeSurfacePermissionState as SurfacePermissionState,
  NativeWidgetSupport as WidgetSupport,
};

export type AndroidSurfaces = NativeCpAndroidSurfacesModule;

export function getAndroidSurfaces(): AndroidSurfaces | null {
  return nativeCpAndroidSurfacesModule;
}
