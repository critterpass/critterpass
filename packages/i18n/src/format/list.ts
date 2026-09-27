/** e.g. "Tokek, Pon and Lundi" — conjunction lists of guides/critters/crew names, locale-ordered. */
export function list(
  locale: string,
  items: readonly string[],
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(locale, options).format(items);
}
