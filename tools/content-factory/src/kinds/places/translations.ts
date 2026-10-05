/**
 * The note's other languages across a regenerated places batch. Approving a batch replaces each
 * item it states, so a fresh run that builds an item without `i18n` would clear its translations.
 * A place whose English note reads as the live one keeps the live translations; a place whose
 * English changed loses them, and the batch says so, so they are written again from the new lines.
 */
import type { ContentItem } from '@cp/content';

import type { BatchCheck } from '../../validators/registry';

type Poi = ContentItem<'places'>;

/** The English lines a translation is written from. */
const TRANSLATED = ['why_go', 'best_time', 'crowd_hint', 'etiquette'] as const;

function sameEnglish(a: Poi['editorial'], b: Poi['editorial']): boolean {
  return TRANSLATED.every((line) => (a[line] ?? null) === (b[line] ?? null));
}

const isItem = (value: unknown): value is Poi =>
  typeof value === 'object' && value !== null && 'ref' in value && 'editorial' in value;

/** The batch's items with the live translations of every place whose English is unchanged. */
export function carryTranslations(items: readonly unknown[], previous: readonly Poi[]): unknown[] {
  const live = new Map(previous.map((poi) => [poi.ref, poi]));
  return items.map((item) => {
    if (!isItem(item) || item.i18n !== undefined) return item;
    const before = live.get(item.ref);
    if (before?.i18n === undefined || !sameEnglish(before.editorial, item.editorial)) return item;
    return { ...item, i18n: before.i18n };
  });
}

/** Lists the places that had translations live and lose them because their English changed. */
export const translationsToRewrite: BatchCheck<'places'> = {
  id: 'translations-to-rewrite',
  severity: 'warn',
  check: ({ items, previous }) => {
    const live = new Map(previous.map((poi) => [poi.ref, poi]));
    const lost = items.filter(
      (item) => item.i18n === undefined && live.get(item.ref)?.i18n !== undefined,
    );
    if (lost.length === 0) return [];
    const languages = [
      ...new Set(lost.flatMap((item) => Object.keys(live.get(item.ref)?.i18n ?? {}))),
    ];
    return [
      {
        ref: null,
        message: `${lost.length} places changed their English note and lose their ${languages.join(', ')} lines; write them again: ${lost.map((item) => item.name).join(', ')}`,
      },
    ];
  },
};
