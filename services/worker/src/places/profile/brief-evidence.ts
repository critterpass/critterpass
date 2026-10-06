/**
 * The evidence a destination brief is written from, gathered in code (the model writes no
 * queries): eight searches for a destination in Vietnam (sights, food and dishes, areas, day trips
 * and stay prices, in Vietnamese and English), six elsewhere, our own fetch of the top pages, and
 * the result snippets beside them. Queries carry the destination's name and topics only (D23).
 */
import type { BriefDestination, ProfilePage } from '@cp/ai';
import { isVietnam } from '@cp/domain';

import { fetchTopPages } from './pages';
import type { PlaceSearch } from './search';

/** Pages fetched and read in full; the other results go in as snippets. */
export const BRIEF_PAGES_READ = 6;
const SNIPPETS_PER_QUERY = 5;

export function briefDestination(name: string, country: string | null): BriefDestination {
  return { name, country: isVietnam(country) ? 'Vietnam' : country };
}

/** The searches for one destination: [query, language]. */
export function briefQueries(name: string, country: string | null): [string, string][] {
  const queries: [string, string][] = [
    [`${name} must see attractions things to do`, 'en'],
    [`${name} best local food dishes where to eat`, 'en'],
    [`${name} neighbourhoods areas to explore`, 'en'],
    [`day trips from ${name}`, 'en'],
    [`${name} hotel prices per night budget mid-range luxury`, 'en'],
  ];
  if (isVietnam(country)) {
    queries.push(
      [`${name} địa điểm tham quan nổi tiếng`, 'vi'],
      [`${name} ăn gì quán ngon nổi tiếng`, 'vi'],
      [`giá phòng khách sạn ${name} bình dân cao cấp một đêm`, 'vi'],
    );
  } else {
    queries.push([`${name} travel guide first time`, 'all']);
  }
  return queries;
}

export async function gatherBriefPages(
  destination: { readonly name: string; readonly country: string | null },
  deps: { readonly search: PlaceSearch; readonly fetch?: typeof fetch | undefined },
  signal?: AbortSignal,
): Promise<ProfilePage[]> {
  const queries = briefQueries(destination.name, destination.country);
  const lists = await Promise.all(
    queries.map(([q, lang]) => deps.search.web(q, lang, signal).catch(() => [])),
  );
  const snippets: ProfilePage[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < SNIPPETS_PER_QUERY; i += 1) {
    for (const list of lists) {
      const hit = list[i];
      if (hit !== undefined && !seen.has(hit.url)) {
        seen.add(hit.url);
        snippets.push(hit);
      }
    }
  }
  const pages = await fetchTopPages(
    snippets.map((s) => s.url),
    [destination.name],
    BRIEF_PAGES_READ,
    {
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(signal === undefined ? {} : { signal }),
    },
  );
  const fetched = new Set(pages.map((p) => p.url));
  return [...pages, ...snippets.filter((s) => !fetched.has(s.url))];
}
