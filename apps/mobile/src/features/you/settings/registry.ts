/**
 * Every Settings row (3n-2, 3n-6), where its value lives and which area answers for it. `synced`
 * rows follow the account to every phone (`user_settings` through `set_settings`, or a consent
 * through `set_consent`); `device` rows stay on this phone; `link` rows open another screen and
 * hold no value. The screen draws rows in this order, section by section. A setting joins only
 * once something acts on it: a switch that changes nothing is not offered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- keys, sections and owners, never copy. */

export type SettingsSectionId =
  'guide' | 'notifications' | 'privacy' | 'offline' | 'app' | 'account';

export type SettingScope =
  | { readonly kind: 'synced'; readonly column: string }
  | { readonly kind: 'consent'; readonly purpose: string }
  | { readonly kind: 'device' }
  | { readonly kind: 'link' };

export interface SettingDef {
  readonly key: string;
  readonly section: SettingsSectionId;
  readonly scope: SettingScope;
  /** The area whose screens or jobs act on the value. */
  readonly owner: string;
}

const synced = (column: string): SettingScope => ({ kind: 'synced', column });
const link: SettingScope = { kind: 'link' };
const device: SettingScope = { kind: 'device' };

export const SETTINGS_SECTIONS: readonly SettingsSectionId[] = [
  'guide',
  'notifications',
  'privacy',
  'offline',
  'app',
  'account',
];

export const SETTINGS_REGISTRY: readonly SettingDef[] = [
  { key: 'chattiness', section: 'guide', scope: synced('chattiness'), owner: 'guide' },
  { key: 'talk-out-loud', section: 'guide', scope: synced('talk_out_loud'), owner: 'guide' },
  {
    key: 'leave-by-alarms',
    section: 'notifications',
    scope: synced('leave_by_through_dnd'),
    owner: 'trip-day',
  },
  { key: 'crew-chat', section: 'notifications', scope: link, owner: 'notifications' },
  { key: 'pings', section: 'notifications', scope: link, owner: 'notifications' },
  { key: 'location', section: 'privacy', scope: link, owner: 'permissions' },
  { key: 'mailbox', section: 'privacy', scope: link, owner: 'bookings' },
  { key: 'budget-max', section: 'privacy', scope: link, owner: 'setup' },
  {
    key: 'help-share',
    section: 'privacy',
    scope: { kind: 'consent', purpose: 'help_auto_share' },
    owner: 'safety',
  },
  {
    key: 'hide-collection',
    section: 'privacy',
    scope: synced('hide_collection'),
    owner: 'critters',
  },
  {
    key: 'hide-travel-style',
    section: 'privacy',
    scope: synced('hide_taste_tags'),
    owner: 'onboarding',
  },
  {
    key: 'hide-lockscreen',
    section: 'privacy',
    scope: synced('hide_lockscreen_details'),
    owner: 'notifications',
  },
  { key: 'offline-trips', section: 'offline', scope: link, owner: 'trip-day' },
  { key: 'sound-effects', section: 'app', scope: device, owner: 'motion' },
  { key: 'haptics', section: 'app', scope: device, owner: 'motion' },
  { key: 'language', section: 'app', scope: link, owner: 'you' },
  { key: 'sign-out', section: 'account', scope: link, owner: 'you' },
  { key: 'delete-account', section: 'account', scope: link, owner: 'you' },
];

export function settingDef(key: string): SettingDef | undefined {
  return SETTINGS_REGISTRY.find((def) => def.key === key);
}
