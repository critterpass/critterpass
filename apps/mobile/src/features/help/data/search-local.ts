/**
 * Help search on the phone, for when the api cannot be reached: the synced articles ranked by
 * their words (title over summary over body, each query word as a prefix, accents ignored), with
 * the categories help was opened from lifted over equal matches. Also the highlight a result row
 * draws over the words that matched.
 */
import { helpCentreContextCategories } from '@cp/domain';

export interface LocalArticle {
  readonly slug: string;
  readonly locale: string;
  readonly category: string;
  readonly title: string;
  readonly summary: string;
  readonly body_md: string;
}

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

export function queryWords(query: string): string[] {
  return [...new Set(fold(query).match(/[\p{L}\p{N}]+/gu) ?? [])];
}

function wordsOf(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hits(words: readonly string[], term: string): number {
  return words.filter((word) => word.startsWith(term)).length;
}

const WEIGHT = { title: 3, summary: 2, body: 1 } as const;
const CONTEXT_LIFT = 0.5;

/** Articles that hold every query word (as a prefix), best first. */
export function searchLocal(
  articles: readonly LocalArticle[],
  query: string,
  context: string | null,
  limit = 8,
): LocalArticle[] {
  const terms = queryWords(query);
  if (terms.length === 0) return [];
  const lifted = helpCentreContextCategories(context);
  const scored = articles.flatMap((article) => {
    const title = wordsOf(article.title);
    const summary = wordsOf(article.summary);
    const body = wordsOf(article.body_md);
    let score = 0;
    for (const term of terms) {
      const found =
        WEIGHT.title * hits(title, term) +
        WEIGHT.summary * hits(summary, term) +
        WEIGHT.body * Math.min(3, hits(body, term));
      if (found === 0) return [];
      score += found;
    }
    if (lifted.includes(article.category)) score += CONTEXT_LIFT;
    return [{ article, score }];
  });
  return scored
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .slice(0, limit)
    .map((entry) => entry.article);
}

export interface Highlighted {
  readonly text: string;
  readonly match: boolean;
}

/** `text` split into runs, the words starting with a query word marked as matches. */
export function highlight(text: string, query: string): Highlighted[] {
  const terms = queryWords(query);
  if (terms.length === 0) return [{ text, match: false }];
  const runs: Highlighted[] = [];
  const pattern = /[\p{L}\p{N}]+/gu;
  let last = 0;
  for (const word of text.matchAll(pattern)) {
    const folded = fold(word[0]);
    const term = terms.find((t) => folded.startsWith(t));
    if (term === undefined) continue;
    const start = word.index;
    const end = start + Math.min(word[0].length, term.length);
    if (start > last) runs.push({ text: text.slice(last, start), match: false });
    runs.push({ text: text.slice(start, end), match: true });
    last = end;
  }
  if (last < text.length) runs.push({ text: text.slice(last), match: false });
  return runs;
}

/** The hub's rows: the context's categories first, in their order, then the rest by title. */
export function hubArticles(
  articles: readonly LocalArticle[],
  context: string | null,
  limit = 2,
): LocalArticle[] {
  const lifted = helpCentreContextCategories(context);
  const rank = (category: string) => {
    const index = lifted.indexOf(category);
    return index === -1 ? lifted.length : index;
  };
  return [...articles]
    .sort((a, b) => rank(a.category) - rank(b.category) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** The articles to use for `locale`: its own, or English when it has none yet. */
export function articlesForLocale(
  byLocale: readonly LocalArticle[],
  locale: string,
): { readonly articles: readonly LocalArticle[]; readonly fallback: boolean } {
  const base = locale.split('-')[0] ?? locale;
  const own = byLocale.filter((a) => a.locale === locale || a.locale === base);
  if (own.length > 0) return { articles: own, fallback: false };
  return { articles: byLocale.filter((a) => a.locale === 'en'), fallback: base !== 'en' };
}
