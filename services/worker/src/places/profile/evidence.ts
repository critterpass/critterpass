/**
 * The evidence a profile is written from, gathered in code (searches the model never writes): two
 * web searches (Vietnamese and English for a place in Vietnam), our own fetch of the top two pages
 * with the place's site first, the result snippets beside them, and the photos.
 */
import type { ProfilePage, ProfilePlace } from '@cp/ai';
import { isVietnam } from '@cp/domain';

import { fetchTopPages } from './pages';
import { storePhotos, type StoredPhoto } from './photos';
import type { PlaceProfileDeps } from './run';
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

export async function findPhotos(
  target: ProfileTarget,
  deps: PlaceProfileDeps,
  signal?: AbortSignal,
): Promise<StoredPhoto[]> {
  if (deps.store === undefined) return [];
  const language = isVietnam(target.country) ? 'vi' : 'all';
  const hits = await deps.search.images(
    `${target.nameLocal ?? target.name} ${target.town}`,
    language,
    signal,
  );
  return storePhotos(target.id, hits, {
    store: deps.store,
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    ...(signal === undefined ? {} : { signal }),
  });
}
