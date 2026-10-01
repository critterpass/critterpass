/**
 * Every OS permission the app primes, written explicitly so no key depends on another plugin's
 * default: the iOS usage strings (each one is shown under the system prompt that follows a
 * primer), the background location mode and Live Activity flags, and the Android permissions.
 * Runs after `expo-location` and `expo-media-library` in app.config.ts, so these strings win.
 *
 * Expo loads config plugins with Node's plain TypeScript stripping, which cannot resolve the
 * workspace package's extensionless imports, so the key lists here mirror
 * packages/domain/src/permissions/manifest.ts; ./with-location-permissions.test.ts pins the two and
 * tools/scripts/check-permissions-manifest.ts checks a prebuild against the shared lists.
 */
import { withAndroidManifest, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/** Purpose key for `requestTemporaryFullAccuracy` (precise location for a critter spot). */
export const FULL_ACCURACY_PURPOSE_KEY = 'CritterSpots';

export const IOS_USAGE_STRINGS: Readonly<Record<string, string>> = {
  NSLocationWhenInUseUsageDescription:
    'CritterPass uses your location on trip days to time leave-by alerts, find critters near you and share your spot with your crew when you choose to.',
  NSLocationAlwaysAndWhenInUseUsageDescription:
    'Allow all the time so critters can find you and your crew map stays current while your phone is in your pocket. Only on trip days; switch it off any time.',
  NSAlarmKitUsageDescription:
    'CritterPass rings a real alarm when it is time to leave for your flight, pickup or tour.',
  NSCameraUsageDescription:
    'CritterPass uses the camera to show critters where you stand and to take photos for your pass, receipts and trip moments. Camera frames stay on your phone.',
  NSMicrophoneUsageDescription: 'Talk to your guide instead of typing.',
  NSSpeechRecognitionUsageDescription: 'Turns what you say to your guide into text.',
  NSPhotoLibraryAddUsageDescription: 'Save share cards and postcards to your photos.',
  NSPhotoLibraryUsageDescription: 'Add the photos you pick to your crew album.',
  NSCalendarsFullAccessUsageDescription:
    'Find dates when your whole crew is free. Only free and busy times are used; event details stay on your phone.',
  NSCalendarsWriteOnlyAccessUsageDescription: 'Adds your trip plans to your calendar.',
};

export const IOS_TEMPORARY_ACCURACY_STRINGS: Readonly<Record<string, string>> = {
  [FULL_ACCURACY_PURPOSE_KEY]:
    'Critters hide at exact spots. Precise location for this visit lets you find them.',
};

export const IOS_FLAGS = ['NSSupportsLiveActivities', 'NSSupportsLiveActivitiesFrequentUpdates'];

export const ANDROID_PERMISSIONS: readonly string[] = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CALENDAR',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
];

type InfoPlist = Record<string, unknown>;

export function applyInfoPlist(plist: InfoPlist): InfoPlist {
  const modes = Array.isArray(plist['UIBackgroundModes'])
    ? (plist['UIBackgroundModes'] as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];
  return {
    ...plist,
    ...IOS_USAGE_STRINGS,
    NSLocationTemporaryUsageDescriptionDictionary: { ...IOS_TEMPORARY_ACCURACY_STRINGS },
    ...Object.fromEntries(IOS_FLAGS.map((flag) => [flag, true])),
    UIBackgroundModes: modes.includes('location') ? modes : [...modes, 'location'],
  };
}

interface ManifestPermission {
  $: { 'android:name': string };
}

interface Manifest {
  manifest: { 'uses-permission'?: ManifestPermission[] };
}

export function applyAndroidPermissions<M extends Manifest>(config: M): M {
  const existing = config.manifest['uses-permission'] ?? [];
  const names = new Set(existing.map((entry) => entry.$['android:name']));
  const added = ANDROID_PERMISSIONS.filter((name) => !names.has(name)).map((name) => ({
    $: { 'android:name': name },
  }));
  config.manifest['uses-permission'] = [...existing, ...added];
  return config;
}

const withLocationPermissions: ConfigPlugin = (config) => {
  const withPlist = withInfoPlist(config, (next) => {
    next.modResults = applyInfoPlist(next.modResults) as typeof next.modResults;
    return next;
  });
  return withAndroidManifest(withPlist, (next) => {
    applyAndroidPermissions(next.modResults);
    return next;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withLocationPermissions;
