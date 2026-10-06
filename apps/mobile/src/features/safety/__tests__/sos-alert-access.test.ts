import { describe, expect, it } from '@jest/globals';

import { sosAccessRows, type SosSurfaceState } from '../sos/alert-access';

const fresh: SosSurfaceState = {
  notifications: true,
  fullScreenIntent: false,
  sosPath: 'high_respects_dnd',
  banners: ['dnd_access', 'full_screen_intent', 'exact_alarm'],
};

describe('what keeps an SOS quiet on Android', () => {
  it('has nothing to ask on iOS or without the surfaces module', () => {
    expect(sosAccessRows(null)).toEqual([]);
  });

  it('asks for notifications alone while they are off: nothing else can help until then', () => {
    expect(sosAccessRows({ ...fresh, notifications: false })).toEqual(['notifications']);
  });

  it('asks for Do Not Disturb access first, then full screen', () => {
    expect(sosAccessRows(fresh)).toEqual(['dnd_access', 'full_screen_intent']);
  });

  it('stops asking for what is allowed', () => {
    expect(sosAccessRows({ ...fresh, sosPath: 'bypass_dnd' })).toEqual(['full_screen_intent']);
    expect(sosAccessRows({ ...fresh, sosPath: 'bypass_dnd', fullScreenIntent: true })).toEqual([]);
  });

  it('never offers a settings page this Android version does not have', () => {
    expect(sosAccessRows({ ...fresh, banners: ['exact_alarm'] })).toEqual([]);
    // Notifications blocked for the channel only: the SOS shows in the app, and DND access helps.
    expect(sosAccessRows({ ...fresh, sosPath: 'in_app_only', banners: ['dnd_access'] })).toEqual([
      'dnd_access',
    ]);
  });
});
