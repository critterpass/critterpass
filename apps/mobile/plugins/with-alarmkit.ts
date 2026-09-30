/**
 * The iOS side of the leave-by alarm (modules/cp-alarm): AlarmKit refuses to ask for access
 * without `NSAlarmKitUsageDescription`, and the alarm's "I'm up" and snooze buttons are App
 * Intents compiled into the CpAlarm pod, which the system only runs once the app target lists the
 * pod's `AppIntentsPackage`. The usage string is normally written by ./with-location-permissions
 * (the shared permission manifest); this plugin keeps whatever is there and only fills a gap.
 *
 * Self-contained on purpose: Expo loads config plugins with Node's plain TypeScript stripping,
 * which cannot resolve relative extensionless imports.
 */
import { withAppDelegate, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

export const ALARMKIT_USAGE_KEY = 'NSAlarmKitUsageDescription';

/** Same copy as ./with-location-permissions (./with-alarmkit.test.ts pins the two). */
export const ALARMKIT_USAGE_STRING =
  'CritterPass rings a real alarm when it is time to leave for your flight, pickup or tour.';

const INTENTS_MARKER = '// cp-alarm: App Intents package';

export const APP_INTENTS_PACKAGE_SWIFT = `
${INTENTS_MARKER}
// \`internal\`, like Expo's generated module provider imports the pod: Swift 6 rejects one module
// imported at two access levels.
internal import AppIntents
internal import CpAlarm

/// Lists the CpAlarm pod's App Intents (the leave-by alarm's "I'm up" and snooze buttons).
struct CritterPassAppIntents: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [CpAlarmIntents.self] }
}
`;

type InfoPlist = Record<string, unknown>;

export function applyAlarmKitUsage(plist: InfoPlist): InfoPlist {
  const current = plist[ALARMKIT_USAGE_KEY];
  if (typeof current === 'string' && current.trim() !== '') return plist;
  return { ...plist, [ALARMKIT_USAGE_KEY]: ALARMKIT_USAGE_STRING };
}

/** Appends the app target's `AppIntentsPackage` to the Swift AppDelegate, once. */
export function applyAppIntentsPackage(contents: string, language: string): string {
  if (language !== 'swift') {
    throw new Error(`with-alarmkit: expected a Swift AppDelegate, got ${language}`);
  }
  if (contents.includes(INTENTS_MARKER)) return contents;
  return `${contents.trimEnd()}\n${APP_INTENTS_PACKAGE_SWIFT}`;
}

const withAlarmKit: ConfigPlugin = (config) => {
  const withUsage = withInfoPlist(config, (mod) => {
    mod.modResults = applyAlarmKitUsage(mod.modResults) as typeof mod.modResults;
    return mod;
  });
  return withAppDelegate(withUsage, (mod) => {
    mod.modResults.contents = applyAppIntentsPackage(
      mod.modResults.contents,
      mod.modResults.language,
    );
    return mod;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withAlarmKit;
