/**
 * Help search as the traveller types: debounced, the api's ranking while it answers, the phone's
 * own copy of the articles when it does not (offline, or an error), and the latest query wins.
 */
import { useEffect, useState } from 'react';

import { searchLocal, type LocalArticle } from './search-local';
import type { HelpSearchHit, SearchHelp } from './help-api';

export const HELP_SEARCH_DEBOUNCE_MS = 200;

export interface HelpSearchState {
  readonly status: 'idle' | 'loading' | 'ready';
  /** True when the results came from the phone because the api could not be reached. */
  readonly local: boolean;
  readonly query: string;
  readonly results: readonly HelpSearchHit[];
}

export function useHelpSearch(input: {
  readonly query: string;
  readonly locale: string;
  readonly context: string | null;
  readonly articles: readonly LocalArticle[];
  readonly search: SearchHelp;
}): HelpSearchState {
  const { locale, context, articles, search } = input;
  const q = input.query.trim();
  const [answer, setAnswer] = useState<HelpSearchState>({
    status: 'idle',
    local: false,
    query: '',
    results: [],
  });
  useEffect(() => {
    if (q.length === 0) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search({ q, locale, context }, controller.signal).then(
        (found) => setAnswer({ status: 'ready', local: false, query: q, results: found.articles }),
        () => {
          if (controller.signal.aborted) return;
          setAnswer({
            status: 'ready',
            local: true,
            query: q,
            results: searchLocal(articles, q, context),
          });
        },
      );
    }, HELP_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, locale, context, articles, search]);
  if (q.length === 0) return { status: 'idle', local: false, query: '', results: [] };
  return answer.query === q ? answer : { ...answer, status: 'loading', query: q };
}
