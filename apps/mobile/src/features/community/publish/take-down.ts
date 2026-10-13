/**
 * Taking a shared plan down or switching one of its links off: each ends something other people
 * can see, so none acts on one tap.
 */
export type Confirming =
  | { readonly kind: 'unpublish' }
  | { readonly kind: 'withdraw' }
  | { readonly kind: 'revoke'; readonly linkId: string; readonly made: string };

/** "12 Oct": the day a read-only link was made, to tell two links apart. */
export function linkDate(createdAt: string, locale: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
}
