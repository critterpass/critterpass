/**
 * The help centre's articles on the phone: the `help` stream held for the app's language and for
 * English (the fallback) for a month after the help centre was last open, so the hub, the reader
 * and search work offline; and the articles to show, English when the language has none yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, stream names and locale codes, never copy. */
import { useEffect, useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import { useLiveRows } from './live-rows';
import { articlesForLocale, type LocalArticle } from './search-local';

const HELP_STREAM = 'help';
const HELP_STREAM_TTL_S = 60 * 60 * 24 * 30;
const TABLES = ['help_articles'];
const ARTICLES_SQL = `SELECT slug, locale, category, title, summary, body_md FROM help_articles
  WHERE locale IN (?, ?, 'en') ORDER BY title`;

export function useHelpStream(locale: string): void {
  const { db } = useLocalFirst();
  useEffect(() => {
    let released = false;
    const held: { unsubscribe(): void }[] = [];
    for (const code of new Set([locale.split('-')[0] ?? locale, 'en'])) {
      db.syncStream(HELP_STREAM, { locale: code })
        .subscribe({ ttl: HELP_STREAM_TTL_S })
        .then(
          (subscription) => {
            if (released) subscription.unsubscribe();
            else held.push(subscription);
          },
          () => undefined,
        );
    }
    return () => {
      released = true;
      for (const subscription of held) subscription.unsubscribe();
    };
  }, [db, locale]);
}

export interface HelpArticles {
  readonly articles: readonly LocalArticle[];
  /** The language has no articles yet, so these are the English ones. */
  readonly fallback: boolean;
  readonly loaded: boolean;
}

export function useHelpArticles(): HelpArticles {
  const locale = useLocale();
  useHelpStream(locale);
  const base = locale.split('-')[0] ?? locale;
  const { rows, loaded } = useLiveRows<LocalArticle>(ARTICLES_SQL, [locale, base], TABLES);
  return useMemo(() => {
    const chosen = articlesForLocale(rows, locale);
    return { articles: chosen.articles, fallback: chosen.fallback && rows.length > 0, loaded };
  }, [rows, locale, loaded]);
}
