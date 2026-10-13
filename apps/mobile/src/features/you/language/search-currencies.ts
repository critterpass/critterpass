import { ISO_CURRENCIES } from '@cp/cost-engine';

/** Currency codes matching `query` (code or symbol), all of them for an empty query. */
export function searchCurrencies(query: string): string[] {
  const q = query.trim().toLowerCase();
  return Object.values(ISO_CURRENCIES)
    .filter(
      (c) => q === '' || c.code.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    )
    .map((c) => c.code)
    .sort((a, b) => a.localeCompare(b));
}
