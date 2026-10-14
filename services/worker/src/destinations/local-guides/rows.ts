/**
 * The local guides files (`guides/<slug>.jsonl`, one guide a line), checked again as they load,
 * with the researchers' checker's rules: the profile is the guide's canonical page (their own site
 * or their listing on a guiding platform, never a white-label mirror, a staging host or a list
 * page), nothing shown carries a phone number or an email, and the summaries fit. A rating is kept
 * only from a third-party platform: one read off the guide's or company's own site is
 * self-reported and stored as none.
 */
import { GUIDE_LICENCE_STATES, LOCAL_GUIDE_KINDS, type LocalGuideRating } from '@cp/domain';
import { z } from 'zod';

const url = z
  .string()
  .trim()
  .regex(/^https?:\/\/[^\s]+$/u);
const summary = z.string().trim().min(1).max(300);

export const localGuideRowSchema = z.object({
  destination: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  type: z.enum(LOCAL_GUIDE_KINDS),
  languages: z.array(z.string()).default([]),
  specialties: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  areas: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  price: z
    .object({ text: z.string().trim().min(1).max(200), source_url: url.nullable().optional() })
    .nullable()
    .optional(),
  profile_url: url,
  review_summary_en: summary,
  review_summary_vi: summary,
  rating: z
    .object({
      value: z.number().min(0).max(5),
      count: z.number().int().min(1),
      platform: z.string().trim().min(1),
      url,
    })
    .nullable()
    .optional(),
  licensed: z.enum(GUIDE_LICENCE_STATES),
  sources: z.array(url).min(1),
});

export type LocalGuideRow = z.infer<typeof localGuideRowSchema>;

/** Guiding and review platforms: a profile or a rating on one of these is third-party. */
const PLATFORM_HOSTS = [
  'toursbylocals.com',
  'withlocals.com',
  'takemetour.com',
  'getyourguide.com',
  'viator.com',
  'tripadvisor.com',
  'gowithguide.com',
  'guruwalk.com',
  'airbnb.com',
  'klook.com',
  'tourhq.com',
  'google.com',
  'goo.gl',
  'trustpilot.com',
];
/** A platform is named for a country too (`tripadvisor.co.uk`, `getyourguide.de`). */
const PLATFORM_NAMES = ['tripadvisor', 'getyourguide', 'viator', 'airbnb', 'google', 'klook'];

const MIRROR =
  /^(?!www\.)[a-z0-9-]+\.(withlocals|takemetour|toursbylocals|getyourguide|viator)\.com$/u;
const STAGING = /kinsta\.page|\.staging\.|wpengine|netlify\.app|vercel\.app/u;
const LIST_PAGE =
  /\/(guides|locals|search|tours)\/?$|expat\.com|yelp\.|tripadvisor\.[a-z.]+\/Attractions/u;
const EMAIL = /@[\w.-]+\.\w+/u;
const PHONE = /\+?\d[\d\s().-]{7,}\d/u;

function hostOf(address: string): string {
  try {
    return new URL(address).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const bare = (host: string) => host.replace(/^www\./u, '');

export function isPlatformHost(host: string): boolean {
  const name = bare(host);
  return (
    PLATFORM_HOSTS.some((platform) => name === platform || name.endsWith(`.${platform}`)) ||
    PLATFORM_NAMES.some((platform) => new RegExp(`(^|\\.)${platform}\\.[a-z.]+$`, 'u').test(name))
  );
}

/** The canonical form of a profile page (https, no fragment, no tracking), or why it is refused. */
export function canonicalProfile(address: string): { url: string } | { problem: string } {
  let parsed: URL;
  try {
    parsed = new URL(address.trim());
  } catch {
    return { problem: 'profile_url is not an address' };
  }
  const host = parsed.hostname.toLowerCase();
  if (MIRROR.test(host) || STAGING.test(host)) {
    return { problem: `profile_url is a mirror or staging host (${host})` };
  }
  if (LIST_PAGE.test(address)) return { problem: 'profile_url is a list or directory page' };
  parsed.protocol = 'https:';
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$|partner_id)/u.test(key)) parsed.searchParams.delete(key);
  }
  return { url: parsed.toString() };
}

/** A phone number or an email in what a reader is shown, outside the guide's own addresses. */
export function contactProblem(row: LocalGuideRow): string | null {
  const shown = JSON.stringify([
    row.name,
    row.languages,
    row.specialties,
    row.areas,
    row.review_summary_en,
    row.review_summary_vi,
  ]);
  if (
    EMAIL.test(shown) ||
    (row.price !== null && row.price !== undefined && EMAIL.test(row.price.text))
  ) {
    return 'looks like an email';
  }
  if (PHONE.test(shown)) return 'looks like a phone number';
  return null;
}

/** The rating as stored: a third-party platform's, else none (self-reported scores are not comparable). */
export function thirdPartyRating(row: LocalGuideRow): LocalGuideRating | null {
  const rating = row.rating ?? null;
  if (rating === null) return null;
  if (/own site|company site|their site|as shown on/iu.test(rating.platform)) return null;
  const ratingHost = bare(hostOf(rating.url));
  const profileHost = bare(hostOf(row.profile_url));
  if (ratingHost === '') return null;
  if (ratingHost === profileHost && !isPlatformHost(ratingHost)) return null;
  return { value: rating.value, count: rating.count, platform: rating.platform, url: rating.url };
}

/** ISO 639-1 language codes, lower case, each once. */
export function languageCodes(languages: readonly string[]): string[] {
  return [
    ...new Set(
      languages
        .map((code) => code.trim().toLowerCase())
        .filter((code) => /^[a-z]{2,3}$/u.test(code)),
    ),
  ];
}
