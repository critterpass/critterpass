/**
 * Help centre articles (3p-1): two to four articles per category, written from the product facts
 * in briefs/help-facts.md only. A lint of banned promises (holding rooms, charging, refunding on a
 * partner's behalf, buying critters) blocks any article that contradicts how CritterPass works, and
 * links must point inside the help centre or to critterpass.app.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  bannedHelpPhrases,
  HELP_CATEGORIES,
  helpArticleItemSchema,
  type ContentItem,
} from '@cp/content';
import { z } from 'zod';

import { FACTORY_DIR } from '../../work';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

const FACTS = () => readFileSync(path.join(FACTORY_DIR, 'briefs', 'help-facts.md'), 'utf8');

/** What a traveller types in the help search, one per category (3p-1's help centre). */
export const CATEGORY_QUERIES: Readonly<Record<(typeof HELP_CATEGORIES)[number], string>> = {
  getting_started: 'how do I start a trip',
  trips_and_crews: 'invite my crew',
  splitting_money: 'split costs',
  passes_and_boosts: 'trip boost',
  refunds: 'refund',
  bookings: 'booking',
  critters: 'buy critters',
  offline_and_maps: 'offline maps',
  safety: 'emergency number',
  insurance: 'travel insurance',
  privacy_and_account: 'delete my account',
};

const outputSchema = z.object({
  articles: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        title: z.string().min(1).max(80),
        summary: z.string().min(1).max(160),
        body_md: z.string().min(1),
      }),
    )
    .min(2)
    .max(4),
});

function helpPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const category = unit.id;
  return {
    system: `You write CritterPass help centre articles in plain, friendly English. Use only the product facts given; if a question is not covered by them, say a human replies by email within two days. Markdown body: short paragraphs, at most one list, no headings above level 2, no links except relative help links like (/help/<slug>). Never promise holds, charges or refunds CritterPass does not make. Reply with JSON only.`,
    user: `Product facts:\n${FACTS()}\n\nCategory: ${category} (people search for things like "${CATEGORY_QUERIES[category as keyof typeof CATEGORY_QUERIES]}"). Make sure one article answers that search in its title or summary.${brief.notes?.['*'] ? `\nReviewer notes: ${brief.notes['*']}` : ''}\nReturn {"articles": [2-4 articles with slug, title, summary, body_md]}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        articles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              title: { type: 'string' },
              summary: { type: 'string' },
              body_md: { type: 'string' },
            },
            required: ['slug', 'title', 'summary', 'body_md'],
            additionalProperties: false,
          },
        },
      },
      required: ['articles'],
      additionalProperties: false,
    },
  };
}

const LINK = /\]\(([^)]+)\)/gu;

export const helpKind: KindModule<'help'> = {
  kind: 'help',
  title: () => 'Help centre',
  gate: 'owner_approval',
  brief: () =>
    Promise.resolve({
      units: HELP_CATEGORIES.map((category) => ({ id: category, input: { category } })),
    }),
  prompt: helpPrompt,
  assemble: (_ctx, brief, outputs) => {
    const slugs = new Set<string>();
    return Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        return (output?.articles ?? []).map((a) => {
          // Two categories can pick the same slug; the later one takes its category as a suffix.
          const slug = slugs.has(a.slug) ? `${a.slug}-${unit.id.replaceAll('_', '-')}` : a.slug;
          slugs.add(slug);
          return helpArticleItemSchema.parse({ ...a, slug, locale: 'en', category: unit.id });
        });
      }),
    );
  },
  validators: {
    items: [
      {
        id: 'truthful-copy',
        severity: 'fail',
        check: (a: ContentItem<'help'>) =>
          bannedHelpPhrases(`${a.title}\n${a.summary}\n${a.body_md}`).map(
            (p) => `promises something CritterPass does not do: "${p}"`,
          ),
      },
      {
        id: 'links-resolve',
        severity: 'fail',
        check: (a, { items }) =>
          [...a.body_md.matchAll(LINK)].flatMap(([, href]) => {
            const target = href ?? '';
            if (target.startsWith('https://critterpass.app')) return [];
            const slug = /^\/help\/([a-z0-9-]+)$/u.exec(target)?.[1];
            return slug !== undefined && items.some((other) => other.slug === slug)
              ? []
              : [`link ${target} goes nowhere`];
          }),
      },
    ],
    batch: [
      {
        id: 'every-category',
        severity: 'fail',
        check: ({ items }) =>
          HELP_CATEGORIES.filter((c) => !items.some((a) => a.category === c)).map((c) => ({
            ref: null,
            message: `no ${c} article`,
          })),
      },
    ],
  },
};

registerKind(helpKind);
