/**
 * The help centre's articles: read over the api in the app's language and in English (the
 * fallback), and kept as the last good copy so the hub, the reader and search work offline once
 * the help centre has been open; and the articles to show, English when the language has none yet.
 */
import { useMemo } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { useHelpLibrary } from '@/data/travel-data/shared-content';
import { useLocale } from '@/lib/i18n/use-locale';

import { articlesForLocale, type LocalArticle } from './search-local';

export interface HelpArticles {
  readonly articles: readonly LocalArticle[];
  /** The language has no articles yet, so these are the English ones. */
  readonly fallback: boolean;
  /** The read has answered: with articles, or with none (offline and no copy kept). */
  readonly loaded: boolean;
}

const NONE: readonly LocalArticle[] = [];

export function useHelpArticles(): HelpArticles {
  const locale = useLocale();
  const library = useHelpLibrary(locale);
  const rows = dataOf(library)?.articles ?? NONE;
  const loaded = library.status !== 'loading';
  return useMemo(() => {
    const chosen = articlesForLocale(rows, locale);
    return { articles: chosen.articles, fallback: chosen.fallback && rows.length > 0, loaded };
  }, [rows, locale, loaded]);
}
