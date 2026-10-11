/**
 * Scan QR on Join a crew (2.16, 2.17): a crew's invite QR holds its link (`…/i/CODE`) or the bare
 * code. The photo is read on the phone (the OCR module's barcode reader); nothing is uploaded and
 * the photo is not kept.
 */
import { normalizeJoinCode } from '@cp/domain';

import { parseIncomingLink } from '@/lib/links/router';

export type ScanOutcome =
  /** The barcode's text that holds the invite (a link, a seat link, or the bare code). */
  | { readonly kind: 'invite'; readonly text: string }
  /** A code was read, but it is not a crew invite. */
  | { readonly kind: 'not_invite' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'denied' };

/** The first of a photo's barcodes that holds an invite, or null when none does. */
export function inviteTextOf(values: readonly string[]): string | null {
  for (const value of values) {
    const trimmed = value.trim();
    if (parseIncomingLink(trimmed)?.kind === 'invite') return trimmed;
    if (normalizeJoinCode(trimmed) !== null) return trimmed;
  }
  return null;
}
