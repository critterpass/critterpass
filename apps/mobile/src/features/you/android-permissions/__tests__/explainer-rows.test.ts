import { describe, expect, it } from '@jest/globals';

import { explainerRows, type SurfacePermissionState } from '../explainer-rows';

/** A fresh install on Android 16: notifications on, every other grant at its default (denied). */
const fresh: SurfacePermissionState = {
  sdkInt: 36,
  notifications: true,
  exactAlarm: false,
  fullScreenIntent: false,
  promoted: true,
  dndAccess: false,
  sosBypassesDnd: false,
  alarmPath: 'heads_up_inexact',
  sosPath: 'high_respects_dnd',
  liveUpdatePath: 'promoted',
  banners: ['dnd_access', 'full_screen_intent', 'exact_alarm'],
};

describe('android permission explainer rows', () => {
  it('offers the alarm grants first, then the SOS, on a fresh install', () => {
    expect(explainerRows(fresh)).toEqual(['exact_alarm', 'full_screen_intent', 'dnd_access']);
  });

  it('only asks for notifications while they are off', () => {
    expect(
      explainerRows({ ...fresh, notifications: false, banners: ['notifications', 'exact_alarm'] }),
    ).toEqual(['notifications']);
  });

  it('leaves out the rows a screen shows its own way', () => {
    expect(explainerRows(fresh, ['notifications'])).toEqual([
      'exact_alarm',
      'full_screen_intent',
      'dnd_access',
    ]);
    expect(explainerRows(fresh, ['dnd_access'])).toEqual(['exact_alarm', 'full_screen_intent']);
  });

  it('keeps the other rows hidden while notifications are off, even when that row is left out', () => {
    expect(
      explainerRows({ ...fresh, notifications: false, banners: ['notifications', 'exact_alarm'] }, [
        'notifications',
      ]),
    ).toEqual([]);
  });

  it('shows nothing once everything is granted, on iOS, or for ids it does not know', () => {
    expect(explainerRows({ ...fresh, banners: [] })).toEqual([]);
    expect(explainerRows(null)).toEqual([]);
    expect(explainerRows({ ...fresh, banners: ['keyguard' as never, 'promoted'] })).toEqual([
      'promoted',
    ]);
  });
});
