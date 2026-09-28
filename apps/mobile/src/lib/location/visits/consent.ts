/**
 * Visit detection consent: off until the user turns it on. The decision comes from the
 * user's synced `consents` row (purpose `visit_detection`); turning it on or off sends
 * `set_consent`. Off means no detected visits at all; existing ones stay deletable.
 */
import { VISIT_CONSENT_COPY_VERSION, type SetConsentPayload } from '@cp/domain';

export const VISIT_CONSENT_PURPOSE = 'visit_detection';

/** The `set_consent` command as the app's command client sends it (offline-capable). */
export const SET_CONSENT = { name: 'set_consent', offline: true } as const;

export interface ConsentRowLike {
  readonly purpose: string;
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
}

export function visitConsentGranted(rows: readonly ConsentRowLike[]): boolean {
  const row = rows.find((candidate) => candidate.purpose === VISIT_CONSENT_PURPOSE);
  return row !== undefined && row.granted_at !== null && row.revoked_at === null;
}

export function visitConsentPayload(granted: boolean): SetConsentPayload {
  return { purpose: 'visit_detection', granted, copy_version: VISIT_CONSENT_COPY_VERSION };
}

export const CONSENT_TABLES = ['consents'] as const;
export const VISIT_CONSENT_SQL =
  "SELECT purpose, granted_at, revoked_at FROM consents WHERE purpose = 'visit_detection'";
