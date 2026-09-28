/* eslint-disable lingui/no-unlocalized-strings -- collection names, category keys and CSS variables, not UI copy. */
/**
 * The tips journal's data: published articles (drafts too, outside production) newest first,
 * with reading time, byline and card colour worked out once for every page, the RSS feed and the
 * OG cards.
 */
import {
  readingMinutes,
  TIP_CATEGORIES,
  tipColour,
  type TipCategory,
  type TipColour,
  tipFrontmatterSchema,
  type TipFrontmatter,
} from '@cp/content/tips';
import { tokens } from '@cp/design-tokens';
import { getCollection, type CollectionEntry } from 'astro:content';

import { GUIDES } from '../../../lib/guides';
import { tipsCopy } from '../copy/tips';

export interface Tip {
  readonly entry: CollectionEntry<'tips'>;
  /** The entry's frontmatter, typed by the package schema. */
  readonly data: TipFrontmatter;
  readonly slug: string;
  readonly minutes: number;
  readonly colour: TipColour;
  readonly guideName: string;
  readonly guidePlace: string;
  readonly guideKind: string;
}

export const TIP_COLOUR_VARS: Readonly<Record<TipColour, string>> = {
  yellow: 'var(--color-yellow)',
  orange: 'var(--color-orange)',
  blue: 'var(--color-blue)',
  sky: 'var(--color-blue-light)',
  pink: 'var(--color-pink)',
  green: 'var(--color-green-base)',
  slate: 'var(--color-ink-150)',
};

/** The same colours as values, for the OG cards (which have no CSS variables). */
export const TIP_CARD_COLOURS: Readonly<Record<TipColour, string>> = {
  yellow: tokens.color.yellow,
  orange: tokens.color.orange,
  blue: tokens.color.blue,
  sky: tokens.color.blue,
  pink: tokens.color.pink,
  green: tokens.color.green.base,
  slate: tokens.color.ink[200],
};

export const CATEGORY_COPY = {
  planning: tipsCopy.planning,
  money: tipsCopy.money,
  'on-the-trip': tipsCopy.onTheTrip,
  'city-guides': tipsCopy.cityGuides,
} as const satisfies Record<TipCategory, unknown>;

export { TIP_CATEGORIES };

const GUIDE_BY_ID: Readonly<Record<string, (typeof GUIDES)[number]>> = Object.fromEntries(
  GUIDES.map((guide) => [guide.name.toLowerCase(), guide]),
);

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** What this module reads of an entry (the collection's generated types are not visible to lint). */
interface TipEntryFields {
  readonly body?: string | undefined;
  readonly data: unknown;
}

export async function allTips(): Promise<readonly Tip[]> {
  const entries = (await getCollection('tips')) as unknown as readonly CollectionEntry<'tips'>[];
  return entries
    .map((entry): Tip => {
      const fields = entry as unknown as TipEntryFields;
      const data = tipFrontmatterSchema.parse(fields.data);
      const guide = GUIDE_BY_ID[data.guide_id];
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the collection's generated entry type (see TipEntryFields).
        entry,
        data,
        slug: data.slug,
        minutes: readingMinutes(fields.body ?? ''),
        colour: tipColour(data),
        guideName: guide === undefined ? data.guide_id : titleCase(guide.name),
        guidePlace: guide?.place ?? '',
        guideKind: guide?.kind ?? 'gecko',
      };
    })
    .filter((tip) => __SHOW_DRAFTS__ || !tip.data.draft)
    .sort((a, b) => b.data.published_at.getTime() - a.data.published_at.getTime());
}

/** Up to three others: same category first, then the newest. */
export function relatedTips(tips: readonly Tip[], current: Tip): readonly Tip[] {
  const others = tips.filter((tip) => tip.slug !== current.slug);
  const same = others.filter((tip) => tip.data.category === current.data.category);
  const rest = others.filter((tip) => tip.data.category !== current.data.category);
  return [...same, ...rest].slice(0, 3);
}
