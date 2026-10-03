/**
 * Help search on the api (`GET /v1/help/articles`), the ranking the server does over every
 * published article; the screens fall back to searching the phone's copy when it cannot be reached.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and query keys, never copy. */
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export interface HelpSearchHit {
  readonly slug: string;
  readonly locale: string;
  readonly category: string;
  readonly title: string;
  readonly summary: string;
}

export interface HelpSearchAnswer {
  readonly articles: readonly HelpSearchHit[];
  readonly locale: string;
  readonly fallback: boolean;
}

export type SearchHelp = (
  input: { readonly q: string; readonly locale: string; readonly context: string | null },
  signal: AbortSignal,
) => Promise<HelpSearchAnswer>;

export const searchHelpOnline: SearchHelp = async ({ q, locale, context }, signal) => {
  const query = new URLSearchParams({ q, locale, limit: '12' });
  if (context !== null) query.set('context', context);
  const response = await fetch(`${resolveApiBaseUrl()}/v1/help/articles?${query.toString()}`, {
    headers: await sessionHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(`help search answered ${String(response.status)}`);
  return (await response.json()) as HelpSearchAnswer;
};
