import { afterEach, describe, expect, it } from '@jest/globals';
import { probePremiumNativeModules, type NativeModuleProbe } from '../native-modules';
import {
  premiumUiOverride,
  reloadPremiumUiOverrideForTests,
  resolvePremiumUi,
  setPremiumUiOverride,
} from '../premium-switch';

describe('resolvePremiumUi', () => {
  it('follows the account flag when the phone has no override', () => {
    expect(resolvePremiumUi({ override: null, flag: true, nativeReady: true })).toEqual({
      premium: true,
      source: 'flag',
    });
    expect(resolvePremiumUi({ override: null, flag: false, nativeReady: true })).toEqual({
      premium: false,
      source: 'flag',
    });
  });

  it("lets the phone's override beat the flag in both directions", () => {
    expect(resolvePremiumUi({ override: true, flag: false, nativeReady: true })).toEqual({
      premium: true,
      source: 'override',
    });
    expect(resolvePremiumUi({ override: false, flag: true, nativeReady: true })).toEqual({
      premium: false,
      source: 'override',
    });
  });

  it('stays on the current UI on a build without the premium native modules, whatever is asked', () => {
    for (const override of [true, false, null]) {
      for (const flag of [true, false]) {
        expect(resolvePremiumUi({ override, flag, nativeReady: false })).toEqual({
          premium: false,
          source: 'binary',
        });
      }
    }
  });
});

describe('probePremiumNativeModules', () => {
  const probe = (present: readonly string[]): NativeModuleProbe => ({
    expoModule: (name) => (present.includes(name) ? {} : null),
    turboModule: (name) => (present.includes(name) ? {} : null),
  });

  it('needs both @expo/ui and the keyboard controller', () => {
    expect(probePremiumNativeModules(probe(['ExpoUI', 'KeyboardController']))).toBe(true);
    expect(probePremiumNativeModules(probe(['ExpoUI']))).toBe(false);
    expect(probePremiumNativeModules(probe(['KeyboardController']))).toBe(false);
    expect(probePremiumNativeModules(probe([]))).toBe(false);
  });
});

describe('the per-phone override', () => {
  afterEach(() => setPremiumUiOverride(null));

  it('is kept across launches until it is cleared', () => {
    setPremiumUiOverride(true);
    reloadPremiumUiOverrideForTests();
    expect(premiumUiOverride()).toBe(true);

    setPremiumUiOverride(false);
    reloadPremiumUiOverrideForTests();
    expect(premiumUiOverride()).toBe(false);

    setPremiumUiOverride(null);
    reloadPremiumUiOverrideForTests();
    expect(premiumUiOverride()).toBeNull();
  });
});
