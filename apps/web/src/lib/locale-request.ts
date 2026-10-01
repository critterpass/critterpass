/* eslint-disable lingui/no-unlocalized-strings -- header names and URL plumbing, not UI copy. */
/**
 * The request side of language negotiation (src/lib/locale.ts): reads the visitor's signals from
 * an Astro request, remembers a choice made in the language switcher in the `cp_locale` cookie,
 * and marks the response so no cache hands one visitor's language to another.
 */
import type { AstroGlobal } from 'astro';

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  SITE_LOCALES,
  negotiateLocale,
  type NegotiatedLocale,
} from './locale';

type RequestContext = Pick<AstroGlobal, 'cookies' | 'request' | 'response'>;

/** Query marker the switcher's links carry: "remember this language", then show its clean address. */
export const REMEMBER_PARAM = 'remember';

/**
 * Picks the page language and stamps the response. `explicit` is a language named by the address
 * itself (`/vi`, or `?lang=vi` on a referral link): it wins for this request and is not remembered,
 * so a shared `/en` link never changes the language a visitor gets at `/`.
 */
export function resolveRequestLocale(
  context: RequestContext,
  explicit: string | null = null,
): NegotiatedLocale {
  const negotiated = negotiateLocale({
    pathLocale: explicit,
    cookieLocale: context.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: context.request.headers.get('accept-language'),
  });
  const { headers } = context.response;
  headers.set('Content-Language', negotiated.locale);
  headers.append('Vary', 'Accept-Language, Cookie');
  // The same address answers in ten languages: never store it shared.
  headers.set('Cache-Control', 'private, no-cache');
  return negotiated;
}

/**
 * The switcher was used: remembers `locale` for a year and sends the visitor on to `cleanPath`,
 * so the marker address is never the one that gets shared, bookmarked or indexed. Returns `null`
 * when the request carries no marker.
 */
export function rememberLocaleChoice(
  context: RequestContext & Pick<AstroGlobal, 'url' | 'redirect'>,
  locale: string,
  cleanPath: string,
): Response | null {
  if (!context.url.searchParams.has(REMEMBER_PARAM)) return null;
  context.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: true,
  });
  const response = context.redirect(cleanPath, 302);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export interface LanguageLink {
  readonly code: string;
  readonly nativeName: string;
  readonly href: string;
  readonly current: boolean;
}

/**
 * The switcher's links: each language's own address, or the same referral link with `?lang=` so a
 * friend's credit survives the switch. Each carries the marker that makes the choice stick.
 */
export function languageLinks(current: string, referredBy: string | null): LanguageLink[] {
  return SITE_LOCALES.map((entry) => ({
    code: entry.code,
    nativeName: entry.nativeName,
    href:
      referredBy === null
        ? `/${entry.code}?${REMEMBER_PARAM}=1`
        : `/w/${encodeURIComponent(referredBy)}?lang=${entry.code}&${REMEMBER_PARAM}=1`,
    current: entry.code === current,
  }));
}
