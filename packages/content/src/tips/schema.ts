/**
 * Tips journal frontmatter (`packages/content/src/tips/*.mdx`), validated by the site's content
 * collection: an article with bad frontmatter stops the site from compiling rather than shipping.
 */
import { z } from 'zod';

export const TIP_CATEGORIES = ['planning', 'money', 'on-the-trip', 'city-guides'] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];

/** Guides who write tips (persona slugs). */
export const TIP_GUIDES = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'] as const;

/** Card colours an article may pick; each category has a default. */
export const TIP_COLOURS = ['yellow', 'orange', 'blue', 'sky', 'pink', 'green', 'slate'] as const;
export type TipColour = (typeof TIP_COLOURS)[number];

export const TIP_CATEGORY_COLOURS: Readonly<Record<TipCategory, TipColour>> = {
  planning: 'green',
  money: 'pink',
  'on-the-trip': 'sky',
  'city-guides': 'orange',
};

export const tipFrontmatterSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u, 'slug: lower-case words joined by dashes'),
    title: z.string().min(8).max(90),
    /** One or two sentences: the card blurb, the meta description and the RSS summary. */
    summary: z.string().min(20).max(220),
    category: z.enum(TIP_CATEGORIES),
    guide_id: z.enum(TIP_GUIDES),
    /** EU AI Act Art. 50: articles drafted with AI say so on the page. */
    ai_assisted: z.boolean(),
    published_at: z.coerce.date(),
    updated_at: z.coerce.date().optional(),
    colour: z.enum(TIP_COLOURS).optional(),
    /** Up to two chat bubbles floating in the article's header. */
    bubbles: z.array(z.string().min(1).max(40)).max(2).default([]),
    featured: z.boolean().default(false),
    /** Drafts appear on staging only, with a draft banner. */
    draft: z.boolean().default(false),
    /** OG card overrides; the title is used when absent. */
    og: z.object({ title: z.string().max(70).optional() }).default({}),
  })
  .strict();
export type TipFrontmatter = z.infer<typeof tipFrontmatterSchema>;

export function tipColour(tip: Pick<TipFrontmatter, 'category' | 'colour'>): TipColour {
  return tip.colour ?? TIP_CATEGORY_COLOURS[tip.category];
}

const WORDS_PER_MINUTE = 200;

/** Whole minutes to read an article body (MDX tags and markup do not count as words). */
export function readingMinutes(body: string): number {
  const words = body
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[#*_>`[\]()-]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => /\p{L}|\p{N}/u.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
