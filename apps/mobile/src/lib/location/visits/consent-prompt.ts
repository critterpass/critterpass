/**
 * When the visit consent sheet appears: at the moment it matters (the first trip-day session
 * running, the user not having decided yet), at most once a week if they dismiss it. The
 * dismissal time is a per-device pref.
 */
import { createMMKV } from 'react-native-mmkv';

export const VISIT_CONSENT_REASK_MS = 7 * 24 * 60 * 60_000;

export interface VisitConsentAskInput {
  readonly tripDaySessionRunning: boolean;
  /** Any consent row for the purpose exists (granted or refused). */
  readonly decided: boolean;
  readonly lastDismissedAt: number | null;
  readonly now: number;
}

export function shouldAskVisitConsent(input: VisitConsentAskInput): boolean {
  if (!input.tripDaySessionRunning || input.decided) return false;
  return (
    input.lastDismissedAt === null || input.now - input.lastDismissedAt >= VISIT_CONSENT_REASK_MS
  );
}

const KEY = 'visit-consent-dismissed-at';
let storage: ReturnType<typeof createMMKV> | null = null;
const prefs = () => (storage ??= createMMKV({ id: 'cp-location-prefs' }));

export function visitConsentDismissedAt(): number | null {
  const value = prefs().getNumber(KEY);
  return value === undefined ? null : value;
}

export function markVisitConsentDismissed(at: number): void {
  prefs().set(KEY, at);
}
