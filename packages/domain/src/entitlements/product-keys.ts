/**
 * The closed catalogue of purchasable products (docs/product-decisions.md §3 "Products and codes";
 * docs/data-model.md §3.14 `products`). Store product ids/prices live in `products.store_ids`
 * (store-side, not code-owned); this key is the one stable identifier every part of the system
 * (entitlement sources, paywall copy, seed data) uses to refer to a product.
 */
import { z } from 'zod';

export const PRODUCT_KEYS = [
  'pass_monthly',
  'pass_yearly',
  'boost_trip',
  'boost_crew_year',
  'gift_pass_3m',
] as const;
export const productKeySchema = z.enum(PRODUCT_KEYS);
export type ProductKey = z.infer<typeof productKeySchema>;

export const PRODUCT_TYPES = ['auto_renew_sub', 'consumable', 'non_renewing'] as const;
export const productTypeSchema = z.enum(PRODUCT_TYPES);
export type ProductType = z.infer<typeof productTypeSchema>;
