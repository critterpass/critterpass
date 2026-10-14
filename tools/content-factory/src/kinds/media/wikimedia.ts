/**
 * Wikimedia Commons, for named landmarks the stock sources lack and for places' own photos
 * (https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). Only public
 * domain, CC0, CC BY and CC BY-SA files qualify; BY and BY-SA need the author, licence and a link,
 * which the credit carries and the app shows on screen. A tinted crop of a BY-SA file stays BY-SA.
 */
import { commonsCredit, commonsLicence, stripHtml, type CommonsPage } from '@cp/domain';

import { getJson, type SourceHttp } from './http';
import type { SourceCandidate } from './pexels';

/** Commons serves thumbnails in standard widths; 1920 is the largest short of 4K. */
const DOWNLOAD_PX = 1920;
const PREVIEW_PX = 960;

export { commonsLicence, stripHtml, type CommonsPage };

/** What a Commons file must be to become a candidate. */
export interface CommonsRules {
  readonly mimes: readonly string[];
  /** The shorter of the long side (any orientation) or the width (landscape only). */
  readonly minPx: number;
  readonly landscapeOnly: boolean;
}

/** Destination heroes: wide JPEGs only. */
export const HERO_RULES: CommonsRules = {
  mimes: ['image/jpeg'],
  minPx: 1600,
  landscapeOnly: true,
};

/** The candidate for one Commons file page, or null when its file or licence does not qualify. */
export function commonsCandidate(page: CommonsPage, rules: CommonsRules): SourceCandidate | null {
  const info = page.imageinfo?.[0];
  const meta = info?.extmetadata;
  if (info === undefined || meta === undefined || !rules.mimes.includes(info.mime)) return null;
  if (rules.landscapeOnly && (info.width < info.height || info.width < rules.minPx)) return null;
  if (Math.max(info.width, info.height) < rules.minPx) return null;
  const credit = commonsCredit(page);
  if (credit === null) return null;
  const download = info.thumburl ?? info.url;
  const scale = Math.min(1, DOWNLOAD_PX / info.width);
  return {
    id: `wikimedia-photo-${page.pageid}`,
    kind: 'photo',
    source: 'wikimedia',
    source_id: String(page.pageid),
    source_url: info.descriptionurl,
    download_url: download,
    preview_url: download.replace(`/${DOWNLOAD_PX}px-`, `/${PREVIEW_PX}px-`),
    title: credit.title,
    author: credit.author,
    author_url: null,
    licence: credit.licence,
    licence_url: credit.licenceUrl,
    attribution_required: credit.attributionRequired,
    credit: credit.credit,
    width: Math.round(info.width * scale),
    height: Math.round(info.height * scale),
    duration_ms: null,
  };
}

function commonsUrl(params: Record<string, string>): URL {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...params,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(DOWNLOAD_PX),
  }).toString();
  return url;
}

export async function wikimediaPhotos(
  http: SourceHttp,
  query: string,
  limit: number,
): Promise<SourceCandidate[]> {
  const url = commonsUrl({
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
  });
  const body = await getJson<{ query?: { pages: CommonsPage[] } }>(http, url);
  return (body.query?.pages ?? []).flatMap((page) => commonsCandidate(page, HERO_RULES) ?? []);
}

/** Commons asks for at most 50 titles per query. */
const TITLES_PER_QUERY = 50;

/** The file pages for `File:` titles, by title as asked (Commons normalises underscores). */
export async function commonsFiles(
  http: SourceHttp,
  titles: readonly string[],
): Promise<Map<string, CommonsPage>> {
  const pages = new Map<string, CommonsPage>();
  const unique = [...new Set(titles)].sort();
  for (let at = 0; at < unique.length; at += TITLES_PER_QUERY) {
    const chunk = unique.slice(at, at + TITLES_PER_QUERY);
    const body = await getJson<{
      query?: { pages?: CommonsPage[]; normalized?: { from: string; to: string }[] };
    }>(http, commonsUrl({ titles: chunk.join('|') }));
    const asked = new Map(chunk.map((title) => [title, title]));
    for (const { from, to } of body.query?.normalized ?? []) asked.set(to, from);
    for (const page of body.query?.pages ?? []) {
      pages.set(asked.get(page.title) ?? page.title, page);
    }
  }
  return pages;
}
