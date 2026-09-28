/**
 * What every native build must declare for the permissions the app primes: the iOS usage-string
 * keys (each with non-empty copy), the temporary full-accuracy purpose, the Info.plist flags and
 * the Android permissions. apps/mobile/plugins/with-location-permissions.ts writes them (mirroring
 * these lists, pinned by its test) and tools/scripts/check-permissions-manifest.ts checks a
 * prebuild against them.
 */
export const IOS_USAGE_KEYS = [
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSAlarmKitUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSSpeechRecognitionUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSCalendarsFullAccessUsageDescription',
] as const;

/** Purpose key for a temporary precise-location grant (a critter spot needs exact position). */
export const FULL_ACCURACY_PURPOSE_KEY = 'CritterSpots';

export const IOS_PLIST_FLAGS = [
  'NSSupportsLiveActivities',
  'NSSupportsLiveActivitiesFrequentUpdates',
] as const;

export const ANDROID_PERMISSIONS = [
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
] as const;
