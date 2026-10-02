/**
 * What opening Help does with the location share (the consent is opt-in: off until the person turns
 * it on, remembered, revocable), and what the share indicator shows: a synced share wins; a share
 * started on this phone shows at once, before its row arrives.
 */
import { HELP_SHARE_TTL_MIN } from '@cp/domain';

import type { ConsentRow, ShareRow } from './help-queries';

export type ShareConsent = 'unasked' | 'on' | 'off';

export function consentOf(rows: readonly ConsentRow[]): ShareConsent {
  const row = rows[0];
  if (row === undefined) return 'unasked';
  return row.granted_at !== null && row.revoked_at === null ? 'on' : 'off';
}

/** On opening Help: ask first (nothing is shared), share for an hour, or leave sharing to a tap. */
export function onOpen(consent: ShareConsent): 'ask' | 'share' | 'idle' {
  if (consent === 'unasked') return 'ask';
  return consent === 'on' ? 'share' : 'idle';
}

export interface PendingShare {
  readonly sessionId: string;
  readonly endsAt: number;
}

export interface ShareView {
  /** Null until the server has the share (only then can it be stopped or extended). */
  readonly shareId: string | null;
  readonly endsAt: number;
  readonly minutesLeft: number;
}

export function pendingShare(sessionId: string, now: number): PendingShare {
  return { sessionId, endsAt: now + HELP_SHARE_TTL_MIN * 60_000 };
}

export function shareView(
  rows: readonly ShareRow[],
  pending: PendingShare | null,
  now: number,
): ShareView | null {
  const row = rows[0];
  const synced = row === undefined ? null : Date.parse(row.ends_at);
  if (row !== undefined && synced !== null && synced > now) {
    return { shareId: row.id, endsAt: synced, minutesLeft: Math.ceil((synced - now) / 60_000) };
  }
  if (pending !== null && pending.endsAt > now) {
    return {
      shareId: null,
      endsAt: pending.endsAt,
      minutesLeft: Math.ceil((pending.endsAt - now) / 60_000),
    };
  }
  return null;
}
