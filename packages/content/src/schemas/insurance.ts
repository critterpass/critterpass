/**
 * `insurance` release items: one generic guidance article per country and a claim checklist.
 * No provider is named or endorsed; each article waits for legal review before it publishes.
 */
import { z } from 'zod';

import { countryCodeSchema, httpsUrlSchema } from './common';

export const insuranceItemSchema = z
  .object({
    country: countryCodeSchema,
    title: z.string().min(1).max(80),
    body_md: z.string().min(1),
    claim_checklist: z.array(z.string().min(1).max(120)).min(3),
    source_urls: z.array(httpsUrlSchema).min(1),
    legal_reviewed: z.boolean(),
  })
  .strict();
export type InsuranceItem = z.infer<typeof insuranceItemSchema>;
