/** The Help share consent's plain data: its row, what "on" means, and the payload a change sends. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, a purpose and a copy version, never copy. */
import type { SetConsentPayload } from '@cp/domain';

export const HELP_SHARE_PURPOSE = 'help_auto_share';
/** The Settings row's own words, kept as evidence of what the person agreed to. */
export const HELP_SHARE_SETTINGS_COPY_VERSION = 'settings-help-share-1';

export const HELP_SHARE_SQL = `SELECT granted_at, revoked_at FROM consents
  WHERE user_id = ? AND purpose = '${HELP_SHARE_PURPOSE}'`;
export const HELP_SHARE_TABLES = ['consents'];

export interface ConsentRow {
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
}

/** On only while granted and not revoked; never asked reads as off. */
export function helpShareOn(row: ConsentRow | undefined): boolean {
  return row !== undefined && row.granted_at !== null && row.revoked_at === null;
}

export function helpSharePayload(granted: boolean): SetConsentPayload {
  return {
    purpose: HELP_SHARE_PURPOSE,
    granted,
    copy_version: HELP_SHARE_SETTINGS_COPY_VERSION,
  };
}
