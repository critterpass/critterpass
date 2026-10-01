/**
 * Linking a forwarding address (doc delta "Link this email?"): mail forwarded to the crew address
 * from an address nobody in the crew has used is held, and that address is emailed a 6-digit code.
 * A member enters it here; `verify_sender_email` links the address to them and releases the held
 * mail to be read, so its bookings arrive as found bookings. The server says a wrong or expired code
 * the same way (`CODE_INVALID`), and how long to wait after too many tries (`RATE_LIMITED`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- error codes and JSON keys, never copy. */
import type { SendResult } from '@/data/commands/client';

export const LINK_CODE_LENGTH = 6;

export type LinkCodeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  /** The code matched no waiting address: mistyped, already used or older than a day. */
  | { readonly kind: 'wrong' }
  /** Too many tries this hour; try again in `minutes`. */
  | { readonly kind: 'wait'; readonly minutes: number }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed' }
  /** Linked; `released` held emails are being read now. */
  | { readonly kind: 'linked'; readonly released: number };

/** The command's payload, once the code is six digits. */
export function linkCodePayload(
  crewId: string | null,
  code: string,
): { readonly crew_id: string; readonly code: string } | null {
  const digits = code.trim();
  if (crewId === null || !/^\d{6}$/u.test(digits)) return null;
  return { crew_id: crewId, code: digits };
}

function numberIn(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === 'number' && Number.isFinite(found) ? found : null;
}

/** What the sheet shows for the server's answer. */
export function linkCodeOutcome(result: SendResult): LinkCodeState {
  switch (result.kind) {
    case 'applied':
      return { kind: 'linked', released: Math.max(0, numberIn(result.result, 'released') ?? 0) };
    case 'unavailable':
      return { kind: 'offline' };
    case 'queued':
      // The command is online-only; a queued answer means it never reached the server.
      return { kind: 'offline' };
    case 'rejected':
      if (result.code === 'CODE_INVALID') return { kind: 'wrong' };
      if (result.code === 'RATE_LIMITED') {
        const seconds = numberIn(result.detail, 'retry_after_s') ?? 3_600;
        return { kind: 'wait', minutes: Math.max(1, Math.ceil(seconds / 60)) };
      }
      return { kind: 'failed' };
  }
}
