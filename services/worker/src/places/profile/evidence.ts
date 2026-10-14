/**
 * The evidence a profile is written from, gathered in code (searches the model never writes): two
 * web searches (Vietnamese and English for a place in Vietnam), our own fetch of the top two pages
 * with the place's site first, and the result snippets beside them. A popular place's run adds
 * one search for tips under the `suggestions` policy: travel blogs, forums and social posts
 * (captions through oEmbed, never fetched), read as snippets. No image is searched for or
 * downloaded: a web image carries no licence we can check.
 */
import type { ProfilePage, ProfilePlace } from '@cp/ai';
import { isVietnam } from '@cp/domain';

import { fetchTopPages } from './pages';
import type { PlaceProfileDeps } from './run';
import { readSocialCaptions } from './brief-evidence';
import type { ProfileTarget } from './store';

const PAGES_READ = 2;

export function profilePlace(target: ProfileTarget): ProfilePlace {
  return {
    name: target.name,
    nameLocal: target.nameLocal,
    category: target.category,
    address: target.address,
    town: target.town,
    country: isVietnam(target.country) ? 'Vietnam' : target.country,
  };
}

/** The tips search of a popular place: blogs, forums and social posts, as snippets. */
export async function gatherTipPages(
  target: ProfileTarget,
  deps: PlaceProfileDeps,
  signal?: AbortSignal,
): Promise<ProfilePage[]> {
  const hits = await deps.search
    .web(`${target.name} ${target.town} tips what to know`, 'en', signal, 'suggestions')
    .catch(() => []);
  return readSocialCaptions(hits.slice(0, 5), deps.fetch ?? fetch);
}

export async function gatherPages(
  target: ProfileTarget,
  deps: PlaceProfileDeps,
  signal?: AbortSignal,
): Promise<ProfilePage[]> {
  const place = profilePlace(target);
  const local = target.nameLocal ?? target.name;
  const where = [place.town, place.country].filter(Boolean).join(' ');
  const queries: [string, string][] = [
    [`${target.name} ${where} opening hours entrance fee`, 'en'],
  ];
  if (isVietnam(target.country))
    queries.unshift([`${local} ${place.town} giờ mở cửa giá vé`, 'vi']);
  else if (target.nameLocal !== null && target.nameLocal !== target.name) {
    queries.unshift([`${target.nameLocal} ${place.town}`, 'all']);
  }
  const lists = await Promise.all(queries.map(([q, lang]) => deps.search.web(q, lang, signal)));
  const snippets: ProfilePage[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    for (const list of lists) {
      const hit = list[i];
      if (hit !== undefined && !seen.has(hit.url)) {
        seen.add(hit.url);
        snippets.push(hit);
      }
    }
  }
  const near = [target.name, target.nameLocal ?? ''];
  const candidates = [
    ...(target.website === null ? [] : [target.website]),
    ...snippets.map((s) => s.url),
  ];
  const pages = await fetchTopPages(candidates, near, PAGES_READ, {
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    ...(signal === undefined ? {} : { signal }),
  });
  return [...pages, ...snippets];
}
