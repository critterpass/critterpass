/**
 * The settings that follow the account to every phone (`user_settings`, written by
 * `set_settings`), as plain data: the synced row mapped to what Settings shows, the defaults while
 * the row has not synced yet, and the patch a change sends (only what differs).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { Chattiness, SettingsPatch } from '@cp/domain';

export interface SyncedSettings {
  readonly chattiness: Chattiness;
  readonly talkOutLoud: boolean;
  readonly hideCollection: boolean;
}

/** `user_settings` column defaults (docs/data-model.md §3.1). */
export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
  chattiness: 'normal',
  talkOutLoud: false,
  hideCollection: false,
};

export const SYNCED_SETTINGS_SQL = `SELECT chattiness, talk_out_loud, hide_collection
  FROM user_settings WHERE user_id = ?`;
export const SYNCED_SETTINGS_TABLES = ['user_settings'];

export interface SyncedSettingsRow {
  readonly chattiness: string | null;
  readonly talk_out_loud: number | null;
  readonly hide_collection: number | null;
}

/** The patch key each field writes. */
const COLUMN: Readonly<Record<keyof SyncedSettings, keyof SettingsPatch>> = {
  chattiness: 'chattiness',
  talkOutLoud: 'talk_out_loud',
  hideCollection: 'hide_collection',
};

export function syncedSettingsColumn(field: keyof SyncedSettings): keyof SettingsPatch {
  return COLUMN[field];
}

function flag(value: number | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : value !== 0;
}

function chattinessOf(value: string | null | undefined): Chattiness {
  return value === 'quiet' || value === 'normal' || value === 'chatty'
    ? value
    : DEFAULT_SYNCED_SETTINGS.chattiness;
}

export function settingsFromRow(row: SyncedSettingsRow | undefined): SyncedSettings {
  const d = DEFAULT_SYNCED_SETTINGS;
  return {
    chattiness: chattinessOf(row?.chattiness),
    talkOutLoud: flag(row?.talk_out_loud, d.talkOutLoud),
    hideCollection: flag(row?.hide_collection, d.hideCollection),
  };
}

/** The `set_settings` patch for `change`, leaving out what already holds; null when nothing moves. */
export function settingsPatch(
  change: Partial<SyncedSettings>,
  current: SyncedSettings,
): SettingsPatch | null {
  const patch: SettingsPatch = {};
  for (const field of Object.keys(change) as (keyof SyncedSettings)[]) {
    const next = change[field];
    if (next === undefined || next === current[field]) continue;
    Object.assign(patch, { [COLUMN[field]]: next });
  }
  return Object.keys(patch).length === 0 ? null : patch;
}
