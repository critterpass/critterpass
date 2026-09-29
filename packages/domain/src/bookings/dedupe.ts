/**
 * One booking, one candidate: the dedupe key names the scope a candidate lives in (the crew for
 * mail to its forward address, the user for their own paste, scan or mailbox), the seller, and the
 * confirmation code when there is one, else the normalised title and start day. The same
 * confirmation forwarded by three members therefore lands once.
 */
import type { ExtractedBooking } from './extracted';

export type DedupeScope =
  { readonly kind: 'crew'; readonly id: string } | { readonly kind: 'user'; readonly id: string };

/** Lower-case ASCII letters and digits only (accents folded, spaces and punctuation dropped). */
export function normaliseForDedupe(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
}

export function dedupeKey(scope: DedupeScope, booking: ExtractedBooking): string {
  const prefix = `${scope.kind}:${scope.id}:${booking.supplier}`;
  const code = booking.supplier_ref === null ? '' : normaliseForDedupe(booking.supplier_ref);
  if (code !== '') return `${prefix}:ref:${code}`.slice(0, 300);
  const day = booking.starts_at?.slice(0, 10) ?? 'undated';
  return `${prefix}:t:${normaliseForDedupe(booking.title).slice(0, 80)}:${day}`.slice(0, 300);
}

/** The placeholder key of a candidate still being read (replaced once its booking is known). */
export function pendingDedupeKey(candidateId: string): string {
  return `pending:${candidateId}`;
}

/** The key a later copy keeps once it is marked a duplicate (the original owns the real key). */
export function duplicateDedupeKey(candidateId: string): string {
  return `duplicate:${candidateId}`;
}
