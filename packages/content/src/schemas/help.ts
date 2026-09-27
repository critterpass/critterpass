/**
 * `help` release items: help centre articles (3p-1) as Markdown, per locale and category. The
 * text must stay truthful to how CritterPass works (never a merchant of record, no room holds):
 * `BANNED_HELP_PHRASES` is the lint the factory and tests run over every article.
 */
import { z } from 'zod';

import { slugSchema } from './common';

export const HELP_CATEGORIES = [
  'getting_started',
  'trips_and_crews',
  'splitting_money',
  'passes_and_boosts',
  'refunds',
  'bookings',
  'critters',
  'offline_and_maps',
  'safety',
  'insurance',
  'privacy_and_account',
] as const;
export const helpCategorySchema = z.enum(HELP_CATEGORIES);
export type HelpCategory = z.infer<typeof helpCategorySchema>;

/** Promises that contradict how bookings and money actually work. */
export const BANNED_HELP_PHRASES: readonly RegExp[] = [
  /\bwe hold your (room|booking|seat|table)\b/iu,
  /\bwe charge you\b/iu,
  /\bwe (will )?refund (you|your booking)\b/iu,
  /\bwe are the merchant\b/iu,
  /\byou can (buy|trade) (a )?critters?\b/iu,
  /\bguaranteed (price|availability)\b/iu,
];

export function bannedHelpPhrases(text: string): string[] {
  return BANNED_HELP_PHRASES.flatMap((pattern) => {
    const match = pattern.exec(text);
    return match === null ? [] : [match[0]];
  });
}

export const helpArticleItemSchema = z
  .object({
    slug: slugSchema,
    locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u),
    category: helpCategorySchema,
    title: z.string().min(1).max(80),
    /** One line under the title in lists and search results. */
    summary: z.string().min(1).max(160),
    body_md: z.string().min(1),
  })
  .strict();
export type HelpArticleItem = z.infer<typeof helpArticleItemSchema>;
