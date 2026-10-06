/**
 * The Android permissions the off-app surfaces (modules/cp-android-surfaces) depend on, written
 * into the app manifest explicitly so the Play declarations (docs/play-policy-declarations.md)
 * match the binary: promoted Live Updates, the user-granted full-screen alarm and exact alarm,
 * and notification-policy access for the SOS channel. `USE_EXACT_ALARM` is the restricted
 * alarm-clock permission CritterPass may never hold, so it is removed with a merge marker that
 * also strips it from any library manifest. The surfaces' receivers, widget providers and dream
 * service come from the module's own manifest through the Gradle manifest merger.
 */
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

export const SURFACE_PERMISSIONS: readonly string[] = [
  'android.permission.POST_PROMOTED_NOTIFICATIONS',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.ACCESS_NOTIFICATION_POLICY',
];

export const FORBIDDEN_PERMISSIONS: readonly string[] = ['android.permission.USE_EXACT_ALARM'];

const TOOLS_NS = 'http://schemas.android.com/tools';

interface ManifestPermission {
  $: { 'android:name': string; 'tools:node'?: string };
}

interface Manifest {
  manifest: { $?: Record<string, string | undefined>; 'uses-permission'?: ManifestPermission[] };
}

export function applySurfacePermissions<M extends Manifest>(config: M): M {
  const existing = (config.manifest['uses-permission'] ?? []).filter(
    (entry) => !FORBIDDEN_PERMISSIONS.includes(entry.$['android:name']),
  );
  const names = new Set(existing.map((entry) => entry.$['android:name']));
  const added = SURFACE_PERMISSIONS.filter((name) => !names.has(name)).map((name) => ({
    $: { 'android:name': name },
  }));
  const removals = FORBIDDEN_PERMISSIONS.map((name) => ({
    $: { 'android:name': name, 'tools:node': 'remove' },
  }));
  config.manifest.$ = { ...config.manifest.$, 'xmlns:tools': TOOLS_NS };
  config.manifest['uses-permission'] = [...existing, ...added, ...removals];
  return config;
}

const withAndroidSurfaces: ConfigPlugin = (config) =>
  withAndroidManifest(config, (next) => {
    applySurfacePermissions(next.modResults);
    return next;
  });

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withAndroidSurfaces;
