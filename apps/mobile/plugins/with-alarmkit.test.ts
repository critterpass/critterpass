/**
 * plugins/with-alarmkit.ts: the AlarmKit usage string is never missing (nor overwritten), and the
 * app target lists the CpAlarm pod's App Intents exactly once.
 */
import { describe, expect, it } from '@jest/globals';

import {
  ALARMKIT_USAGE_KEY,
  ALARMKIT_USAGE_STRING,
  APP_INTENTS_PACKAGE_SWIFT,
  applyAlarmKitUsage,
  applyAppIntentsPackage,
} from './with-alarmkit';
import { IOS_USAGE_STRINGS } from './with-location-permissions';

const APP_DELEGATE = `import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
}
`;

describe('with-alarmkit config plugin', () => {
  it('uses the permission manifest copy for the AlarmKit usage string', () => {
    expect(ALARMKIT_USAGE_STRING).toBe(IOS_USAGE_STRINGS[ALARMKIT_USAGE_KEY]);
  });

  it('fills a missing or blank usage string and keeps an existing one', () => {
    expect(applyAlarmKitUsage({})[ALARMKIT_USAGE_KEY]).toBe(ALARMKIT_USAGE_STRING);
    expect(applyAlarmKitUsage({ [ALARMKIT_USAGE_KEY]: ' ' })[ALARMKIT_USAGE_KEY]).toBe(
      ALARMKIT_USAGE_STRING,
    );
    const kept = { [ALARMKIT_USAGE_KEY]: 'Localised copy', Other: 1 };
    expect(applyAlarmKitUsage(kept)).toEqual(kept);
  });

  it('adds the App Intents package to the AppDelegate once', () => {
    const once = applyAppIntentsPackage(APP_DELEGATE, 'swift');
    expect(once.startsWith(APP_DELEGATE.trimEnd())).toBe(true);
    expect(once).toContain('[CpAlarmIntents.self]');
    expect(once).toContain('internal import CpAlarm');
    expect(applyAppIntentsPackage(once, 'swift')).toBe(once);
    expect(once.split(APP_INTENTS_PACKAGE_SWIFT.trim()).length).toBe(2);
  });

  it('refuses an Objective-C AppDelegate rather than writing Swift into it', () => {
    expect(() => applyAppIntentsPackage('@implementation AppDelegate', 'objcpp')).toThrow(
      /Swift AppDelegate/,
    );
  });
});
