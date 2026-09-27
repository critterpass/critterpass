import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { impact, SOUND_CUE_IDS } from '../impact';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: { Confirm: 'confirm' },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

describe('SOUND_CUE_IDS', () => {
  it('matches every cue declared in sound.tokens.json exactly', () => {
    expect([...SOUND_CUE_IDS].sort()).toEqual(Object.keys(tokens.sound.cue).sort());
  });
});

describe('impact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('throws on an unknown cue id instead of failing silently', () => {
    // @ts-expect-error deliberately invalid at the type level too
    expect(() => impact('not-a-real-cue')).toThrow(/unknown sound cue/);
  });

  it('fires a heavy impact for thud.heavy on iOS', () => {
    impact('thud.heavy');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy);
  });

  it('fires the Android Confirm haptic for thud.heavy on Android ("CONFIRM + heavy impact")', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    impact('thud.heavy');
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(Haptics.AndroidHaptics.Confirm);
  });

  it('fires selection for tick and snap', () => {
    impact('tick');
    impact('snap');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('fires the matching notification feedback for success/warning/error', () => {
    impact('success');
    impact('warning');
    impact('error');
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      1,
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      2,
      Haptics.NotificationFeedbackType.Warning,
    );
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      3,
      Haptics.NotificationFeedbackType.Error,
    );
  });

  it('fires no haptic for a cue with hapticIOS: null (whoosh)', () => {
    impact('whoosh');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('fires no haptic yet for continuous/long/system patterns (holdRamp, sos, alarm — cp-haptics owns these)', () => {
    impact('holdRamp');
    impact('sos');
    impact('alarm');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});
