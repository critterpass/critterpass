/**
 * The affiliate disclosure every card with a partner link carries (docs/product-decisions.md §5):
 * "We may earn a commission. It never changes what Pon recommends." A link result from the api
 * always names the disclosure key, so no surface can render a partner link without it.
 */
import { z } from 'zod';

export const AFFILIATE_DISCLOSURE_KEY = 'suppliers.disclosure.affiliate';

export const AFFILIATE_DISCLOSURE_EN =
  'We may earn a commission. It never changes what Pon recommends.';

export const affiliateDisclosureSchema = z.literal(AFFILIATE_DISCLOSURE_KEY);

export interface Disclosed<T> {
  readonly value: T;
  readonly disclosure: typeof AFFILIATE_DISCLOSURE_KEY;
}

export function withAffiliateDisclosure<T>(value: T): Disclosed<T> {
  return { value, disclosure: AFFILIATE_DISCLOSURE_KEY };
}
