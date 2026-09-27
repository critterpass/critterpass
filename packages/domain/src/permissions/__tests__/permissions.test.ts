import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REASK_WINDOW_MS,
  canonicalPermissionState,
  decideAsk,
  deriveCapabilities,
  devicePermissionStateSchema,
  isPermissionKind,
  isUsable,
  isUserInitiated,
  kindForTrigger,
  permissionStatesEqual,
  PERMISSION_TRIGGERS,
  setConsentPayloadSchema,
  TRIGGER_CATALOGUE,
  type AskInput,
} from '../index';

describe('permission status', () => {
  it('treats granted, limited and provisional as usable', () => {
    expect(['granted', 'limited', 'provisional'].every((s) => isUsable(s as 'granted'))).toBe(true);
    expect(isUsable('denied')).toBe(false);
    expect(isUsable('not_determined')).toBe(false);
  });

  it('validates the mirror strictly and compares it key-order independent', () => {
    expect(() => devicePermissionStateSchema.parse({ contacts: 'granted' })).toThrow();
    const a = devicePermissionStateSchema.parse({
      camera: 'granted',
      notifications: 'provisional',
    });
    const b = { notifications: 'provisional', camera: 'granted', la_enabled: undefined } as const;
    expect(permissionStatesEqual(a, b)).toBe(true);
    expect(permissionStatesEqual(a, { ...b, camera: 'denied' })).toBe(false);
    expect(Object.keys(canonicalPermissionState(b))).toEqual(['camera', 'notifications']);
    expect(isPermissionKind('camera')).toBe(true);
    expect(isPermissionKind('contacts')).toBe(false);
  });

  it('derives only capabilities, never the raw list', () => {
    expect(deriveCapabilities({})).toEqual({
      push: 'inbox',
      canRing: false,
      liveActivities: false,
      encounters: 'off',
    });
    expect(
      deriveCapabilities({
        notifications: 'granted',
        alarms: 'granted',
        location: 'granted',
        location_level: 'always',
        la_enabled: true,
      }),
    ).toEqual({ push: 'alert', canRing: true, liveActivities: true, encounters: 'background' });
    expect(
      deriveCapabilities({
        notifications: 'provisional',
        exact_alarm: true,
        location: 'granted',
        location_level: 'wiu',
      }),
    ).toMatchObject({ push: 'quiet', canRing: true, encounters: 'session' });
    expect(deriveCapabilities({ location: 'granted' }).encounters).toBe('off');
    expect(deriveCapabilities({ location: 'denied', location_level: 'wiu' }).encounters).toBe(
      'off',
    );
  });
});

describe('triggers', () => {
  it('maps every just-in-time trigger to one kind', () => {
    for (const trigger of PERMISSION_TRIGGERS) {
      const kind = kindForTrigger(trigger);
      if (trigger === 'onboarding' || trigger === 'settings') expect(kind).toBeNull();
      else expect(kind).toBe(TRIGGER_CATALOGUE[trigger].kind);
    }
    expect(kindForTrigger('voice')).toBe('microphone');
    expect(kindForTrigger('first_leave_by')).toBe('alarms');
  });

  it('knows which asks the user started', () => {
    expect(isUserInitiated('onboarding')).toBe(true);
    expect(isUserInitiated('settings')).toBe(true);
    expect(isUserInitiated('real_photo')).toBe(true);
    expect(isUserInitiated('first_vote')).toBe(false);
  });
});

describe('decideAsk', () => {
  const now = 1_000_000_000_000;
  const base: AskInput = {
    status: 'not_determined',
    canAskAgain: true,
    satisfied: false,
    lastDeclinedAt: null,
    now,
    userInitiated: false,
  };

  it('shows nothing when the need is met', () => {
    expect(decideAsk({ ...base, status: 'granted', satisfied: true })).toBe('satisfied');
  });

  it('offers only Settings once the OS said denied or will not prompt', () => {
    expect(decideAsk({ ...base, status: 'denied' })).toBe('settings_only');
    expect(decideAsk({ ...base, status: 'granted', canAskAgain: false })).toBe('settings_only');
    expect(decideAsk({ ...base, status: 'restricted' })).toBe('unavailable');
  });

  it('re-shows a declined primer at most once per window', () => {
    const declined = { ...base, lastDeclinedAt: now - 1000 };
    expect(decideAsk(base)).toBe('primer');
    expect(decideAsk(declined)).toBe('suppressed');
    expect(decideAsk({ ...declined, lastDeclinedAt: now - DEFAULT_REASK_WINDOW_MS })).toBe(
      'primer',
    );
    expect(decideAsk({ ...declined, windowMs: 500 })).toBe('primer');
    expect(decideAsk({ ...declined, userInitiated: true })).toBe('primer');
  });

  it('asks again for an upgrade (WIU to Always) while the prompt is still available', () => {
    expect(decideAsk({ ...base, status: 'granted' })).toBe('primer');
  });
});

describe('set_consent payload', () => {
  it('accepts the app-settable purposes only', () => {
    expect(setConsentPayloadSchema.parse({ purpose: 'visit_detection', granted: true })).toEqual({
      purpose: 'visit_detection',
      granted: true,
    });
    expect(() => setConsentPayloadSchema.parse({ purpose: 'faces', granted: true })).toThrow();
    expect(() =>
      setConsentPayloadSchema.parse({
        purpose: 'analytics',
        granted: true,
        copy_version: 'Bad Copy',
      }),
    ).toThrow();
  });
});
