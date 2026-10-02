/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
/** A clock time in the reader's locale ("4:42 PM", "16:42"). */
export function clockTime(at: number | string, locale: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** A `tel:` link for a printed number ("+65 6812 3456"). */
export function telUrl(number: string): string {
  return `tel:${number.replace(/[^\d+]/gu, '')}`;
}
