/**
 * Supplier names editorial text must not contain. The brand list is the AI package's; words that
 * are also ordinary English (booking, trip, hotels, tiket) are matched only in their brand forms.
 */
import { SUPPLIER_BRANDS } from '@cp/ai';

const ORDINARY = new Set(['booking', 'trip', 'hotels', 'tiket']);
const BRAND_FORMS = ['booking.com', 'trip.com', 'hotels.com', 'tiket.com'];

export const SUPPLIER_WORDS: readonly string[] = [
  ...SUPPLIER_BRANDS.filter((brand) => !ORDINARY.has(brand)),
  ...BRAND_FORMS,
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Supplier names found in the text, as whole words. */
export function suppliersNamed(text: string): string[] {
  const lower = text.toLowerCase();
  return SUPPLIER_WORDS.filter((word) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}([^\\p{L}\\p{N}]|$)`, 'u').test(lower),
  );
}
