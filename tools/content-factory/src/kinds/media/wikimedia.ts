/**
 * Wikimedia Commons, for named landmarks the stock sources lack and for places' own photos
 * (https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). Only public
 * domain, CC0, CC BY and CC BY-SA files qualify; BY and BY-SA need the author, licence and a link,
 * which the credit carries and the app shows on screen. A tinted crop of a BY-SA file stays BY-SA.
 */
import { getJson, type SourceHttp } from './http';
import type { SourceCandidate } from './pexels';

/** Commons serves thumbnails in standard widths; 1920 is the largest short of 4K. */
const DOWNLOAD_PX = 1920;
const PREVIEW_PX = 960;

interface ExtValue {
  value: string;
}

export interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    width: number;
    height: number;
    descriptionurl: string;
    mime: string;
    extmetadata?: Partial<
      Record<
        'Artist' | 'LicenseShortName' | 'LicenseUrl' | 'AttributionRequired' | 'ObjectName',
        ExtValue
      >
    >;
  }[];
}

/** Licence code for a Commons short name, or null for a licence we do not reuse (NC, ND, GFDL). */
export function commonsLicence(shortName: string): string | null {
  const name = shortName.trim().toLowerCase();
  if (name === 'public domain' || name === 'pd') return 'public-domain';
  if (name === 'cc0' || name === 'cc0 1.0') return 'cc0';
  const match = /^cc by(-sa)? (\d\.\d)$/u.exec(name);
  if (match === null) return null;
  return `cc-by${match[1] ?? ''}-${match[2] ?? ''}`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

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
  const shortName = meta.LicenseShortName?.value ?? '';
  const licence = commonsLicence(shortName);
  const author = stripHtml(meta.Artist?.value ?? '').slice(0, 200);
  if (licence === null || author === '') return null;
  const free = licence === 'public-domain' || licence === 'cc0';
  const download = info.thumburl ?? info.url;
  const scale = Math.min(1, DOWNLOAD_PX / info.width);
  const licenceUrl =
    meta.LicenseUrl?.value ?? 'https://commons.wikimedia.org/wiki/Commons:Licensing';
  return {
    id: `wikimedia-photo-${page.pageid}`,
    kind: 'photo',
    source: 'wikimedia',
    source_id: String(page.pageid),
    source_url: info.descriptionurl,
    download_url: download,
    preview_url: download.replace(`/${DOWNLOAD_PX}px-`, `/${PREVIEW_PX}px-`),
    title: stripHtml(meta.ObjectName?.value ?? page.title.replace(/^File:/u, '')).slice(0, 300),
    author,
    author_url: null,
    licence,
    licence_url: licenceUrl.replace(/^http:/u, 'https:'),
    attribution_required: !free,
    credit: `${author} · ${free ? 'Public domain' : shortName} · Wikimedia Commons`.slice(0, 300),
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
