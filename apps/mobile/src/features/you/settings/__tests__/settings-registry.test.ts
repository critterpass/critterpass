/**
 * The Settings registry agrees with the server's contract: every synced row writes a column
 * `set_settings` accepts, every consent row a purpose `set_consent` accepts, and the screen's own
 * mapping writes the column the registry names. Also the settings' plain-data rules.
 */
import { describe, expect, it } from '@jest/globals';

import { SETTABLE_CONSENT_PURPOSES, SETTINGS_COLUMNS, setConsentPayloadSchema } from '@cp/domain';

import { helpShareOn, helpSharePayload } from '../help-share';
import { SETTINGS_REGISTRY, SETTINGS_SECTIONS } from '../registry';
import {
  DEFAULT_SYNCED_SETTINGS,
  settingsFromRow,
  settingsPatch,
  syncedSettingsColumn,
  type SyncedSettings,
} from '../synced-settings';
import { tapTokek, TOKEK_TAP_GAP_MS } from '../tokek-taps';
import { locationValue } from '../location-row';

describe('settings registry', () => {
  it('names each row once, in a known section', () => {
    const keys = SETTINGS_REGISTRY.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of SETTINGS_REGISTRY) expect(SETTINGS_SECTIONS).toContain(def.section);
  });

  it('writes only columns and consents the server accepts', () => {
    for (const def of SETTINGS_REGISTRY) {
      if (def.scope.kind === 'synced') {
        expect(SETTINGS_COLUMNS).toContain(def.scope.column);
      }
      if (def.scope.kind === 'consent') {
        expect(SETTABLE_CONSENT_PURPOSES).toContain(def.scope.purpose);
      }
    }
    const registered = SETTINGS_REGISTRY.flatMap((def) =>
      def.scope.kind === 'synced' ? [def.scope.column] : [],
    );
    for (const field of Object.keys(DEFAULT_SYNCED_SETTINGS) as (keyof SyncedSettings)[]) {
      expect(registered).toContain(syncedSettingsColumn(field));
    }
  });
});

describe('synced settings', () => {
  it('reads the column defaults before the row syncs, and the row once it has', () => {
    expect(settingsFromRow(undefined)).toEqual(DEFAULT_SYNCED_SETTINGS);
    expect(
      settingsFromRow({ ...rowOf(), chattiness: 'chatty', talk_out_loud: 1, hide_taste_tags: 1 }),
    ).toEqual({
      chattiness: 'chatty',
      talkOutLoud: true,
      leaveByThroughDnd: true,
      hideTasteTags: true,
      hideLockscreenDetails: false,
      hideCollection: false,
    });
    // The leave-by alarm rings through Do Not Disturb unless switched off.
    expect(settingsFromRow({ ...rowOf(), leave_by_through_dnd: 0 }).leaveByThroughDnd).toBe(false);
    expect(settingsFromRow({ ...rowOf(), chattiness: 'loud' }).chattiness).toBe('normal');
  });

  it('sends only what changes, as the wire column', () => {
    expect(
      settingsPatch({ hideCollection: true, chattiness: 'normal' }, DEFAULT_SYNCED_SETTINGS),
    ).toEqual({ hide_collection: true });
    expect(
      settingsPatch(
        { hideLockscreenDetails: true, leaveByThroughDnd: false },
        DEFAULT_SYNCED_SETTINGS,
      ),
    ).toEqual({ hide_lockscreen_details: true, leave_by_through_dnd: false });
    expect(settingsPatch({ chattiness: 'normal' }, DEFAULT_SYNCED_SETTINGS)).toBeNull();
  });
});

describe('help share consent', () => {
  it('is on only while granted and not revoked; unasked reads as off', () => {
    expect(helpShareOn(undefined)).toBe(false);
    expect(helpShareOn({ granted_at: '2026-10-01', revoked_at: null })).toBe(true);
    expect(helpShareOn({ granted_at: '2026-10-01', revoked_at: '2026-10-02' })).toBe(false);
  });

  it('sends a payload set_consent accepts, either way', () => {
    for (const granted of [true, false]) {
      expect(setConsentPayloadSchema.parse(helpSharePayload(granted))).toEqual({
        purpose: 'help_auto_share',
        granted,
        copy_version: 'settings-help-share-1',
      });
    }
  });
});

describe('location row', () => {
  it('reads while-in-use as during trips, and says when it is off or not asked', () => {
    const report = (over: object) =>
      ({ kind: 'location', status: 'granted', canAskAgain: true, ...over }) as never;
    expect(locationValue(report({ level: 'wiu' }))).toBe('trips');
    expect(locationValue(report({ level: 'always' }))).toBe('always');
    expect(locationValue(report({ status: 'denied' }))).toBe('off');
    expect(locationValue(undefined)).toBe('ask');
  });
});

describe('Tokek easter egg', () => {
  it('fires on the fifth quick tap and starts over after a slow one', () => {
    let taps: number[] = [];
    const fired: boolean[] = [];
    for (const at of [0, 300, 600, 3000, 3300, 3600, 3900, 4200]) {
      const next = tapTokek(taps, at);
      taps = next.taps;
      fired.push(next.fire);
    }
    expect(fired).toEqual([false, false, false, false, false, false, false, true]);
    expect(tapTokek([0], TOKEK_TAP_GAP_MS + 1).taps).toEqual([TOKEK_TAP_GAP_MS + 1]);
  });
});

function rowOf() {
  return {
    chattiness: null,
    talk_out_loud: null,
    leave_by_through_dnd: null,
    hide_taste_tags: null,
    hide_lockscreen_details: null,
    hide_collection: null,
  };
}
