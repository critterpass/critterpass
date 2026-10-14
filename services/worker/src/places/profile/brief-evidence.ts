/**
 * The evidence a destination brief is written from, gathered in code (the model writes no
 * queries): eight searches for a destination in Vietnam (sights, food and dishes, areas, day trips
 * and stay prices, in Vietnamese and English), six elsewhere, our own fetch of the top pages, and
 * the result snippets beside them. The links of a destination and the ways to it from a home city
 * are searched the same way. Queries carry place names and topics only (D23).
 *
 * Under the `suggestions` policy the brief also reads travel blogs, forums and social posts.
 * A social page is never fetched: a TikTok or YouTube result is read through the platform's
 * public oEmbed (its caption), anything else social (Instagram, Facebook, Reddit) by its search
 * snippet only.
 */
import type { BriefDestination, ProfilePage } from '@cp/ai';
import { isSocialUrl, isVietnam } from '@cp/domain';
import { classifyLink, readPost } from '@cp/suppliers';

import { fetchTopPages } from './pages';
import type { PlaceSearch, ResearchPolicy } from './search';

/** Pages fetched and read in full; the other results go in as snippets. */
export const BRIEF_PAGES_READ = 6;
const SNIPPETS_PER_QUERY = 5;
/** Social results read through oEmbed per run, at most. */
const SOCIAL_CAPTIONS = 6;
const CAPTION_MAX = 1_500;

/**
 * Social results with their caption: TikTok and YouTube through oEmbed, put before the search
 * snippet (the snippet alone stays when the platform does not answer); every other result is
 * left as it came.
 */
export async function readSocialCaptions(
  snippets: readonly ProfilePage[],
  fetchImpl: typeof fetch,
): Promise<ProfilePage[]> {
  let budget = SOCIAL_CAPTIONS;
  return Promise.all(
    snippets.map(async (snippet) => {
      const link = classifyLink(snippet.url);
      if (link === null || (link.platform !== 'tiktok' && link.platform !== 'youtube')) {
        return snippet;
      }
      if (budget <= 0) return snippet;
      budget -= 1;
      const read = await readPost(link.platform, link.url, { fetch: fetchImpl }).catch(() => null);
      if (read?.kind !== 'post' || read.post.text.trim() === '') return snippet;
      const caption = read.post.text.trim().slice(0, CAPTION_MAX);
      const text = snippet.text.trim() === '' ? caption : `${caption}\n${snippet.text}`;
      return { ...snippet, title: read.post.title ?? snippet.title, text };
    }),
  );
}

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

/** The top pages of `queries` read in full (windowed near `near`), the other results as snippets. */
export async function gatherPages(
  queries: readonly [string, string][],
  near: readonly string[],
  deps: { readonly search: PlaceSearch; readonly fetch?: typeof fetch | undefined },
  signal?: AbortSignal,
  policy: ResearchPolicy = 'facts',
): Promise<ProfilePage[]> {
  const lists = await Promise.all(
    queries.map(([q, lang]) => deps.search.web(q, lang, signal, policy).catch(() => [])),
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
    snippets.filter((s) => !isSocialUrl(s.url)).map((s) => s.url),
    near,
    BRIEF_PAGES_READ,
    {
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(signal === undefined ? {} : { signal }),
    },
  );
  const fetched = new Set(pages.map((p) => p.url));
  const rest = snippets.filter((s) => !fetched.has(s.url));
  const read =
    policy === 'suggestions' ? await readSocialCaptions(rest, deps.fetch ?? fetch) : rest;
  return [...pages, ...read];
}

/** The social and forum searches a brief adds under the `suggestions` policy. */
export function socialBriefQueries(name: string, country: string | null): [string, string][] {
  const queries: [string, string][] = [
    [`${name} travel blog itinerary hidden gems`, 'en'],
    [`${name} tiktok must try places`, 'en'],
    [`${name} reddit recommendations`, 'en'],
  ];
  if (isVietnam(country)) queries.push([`${name} review địa điểm check in tiktok`, 'vi']);
  return queries;
}

export function gatherBriefPages(
  destination: { readonly name: string; readonly country: string | null },
  deps: { readonly search: PlaceSearch; readonly fetch?: typeof fetch | undefined },
  signal?: AbortSignal,
  policy: ResearchPolicy = 'facts',
): Promise<ProfilePage[]> {
  const queries = briefQueries(destination.name, destination.country);
  if (policy === 'suggestions') {
    queries.push(...socialBriefQueries(destination.name, destination.country));
  }
  return gatherPages(queries, [destination.name], deps, signal, policy);
}

/** The searches for a destination's day trips and onward cities: [query, language]. */
export function linkQueries(name: string, country: string | null): [string, string][] {
  const queries: [string, string][] = [
    [`best day trips from ${name} how to get there travel time`, 'en'],
    [`${name} where to go next nearby cities by train or bus how long`, 'en'],
    [`${name} day trip ticket price train bus`, 'en'],
  ];
  if (isVietnam(country)) {
    queries.push(
      [`từ ${name} đi đâu chơi trong ngày mất bao lâu`, 'vi'],
      [`từ ${name} đi các thành phố lân cận bằng tàu xe giá vé`, 'vi'],
    );
  }
  return queries;
}

/** The searches for a journey between two places (the pair of names only, D23). */
export function homeLinkQueries(
  origin: string,
  destination: string,
  vietnamese: boolean,
): [string, string][] {
  const queries: [string, string][] = [
    [`how to get from ${origin} to ${destination} flight train bus travel time`, 'en'],
    [`${origin} to ${destination} flight duration ticket price`, 'en'],
    [`${origin} to ${destination} by bus or train how long cost`, 'en'],
  ];
  if (vietnamese) queries.push([`từ ${origin} đi ${destination} mất bao lâu giá vé`, 'vi']);
  return queries;
}
