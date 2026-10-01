/* eslint-disable lingui/no-unlocalized-strings -- header names and URL plumbing, not UI copy. */
/**
 * The request side of language negotiation (src/lib/locale.ts): reads the visitor's signals from
 * an Astro request, remembers an explicit choice in the `cp_locale` cookie, and marks the response
 * so no cache hands one visitor's language to another.
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

/**
 * Picks the page language and stamps the response. `explicit` is a language named by the address
 * itself (`/vi`, or `?lang=vi` on a referral link): it wins, and is remembered for a year.
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
  if (negotiated.source === 'path') {
    context.cookies.set(LOCALE_COOKIE, negotiated.locale, {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: true,
    });
  }
  const { headers } = context.response;
  headers.set('Content-Language', negotiated.locale);
  headers.append('Vary', 'Accept-Language, Cookie');
  // The same address answers in ten languages (and may carry a Set-Cookie): never store it shared.
  headers.set('Cache-Control', 'private, no-cache');
  return negotiated;
}

export interface LanguageLink {
  readonly code: string;
  readonly nativeName: string;
  readonly href: string;
  readonly current: boolean;
}

/**
 * The switcher's links: each language's own address, or the same referral link with `?lang=` so a
 * friend's credit survives the switch.
 */
export function languageLinks(current: string, referredBy: string | null): LanguageLink[] {
  return SITE_LOCALES.map((entry) => ({
    code: entry.code,
    nativeName: entry.nativeName,
    href:
      referredBy === null
        ? `/${entry.code}`
        : `/w/${encodeURIComponent(referredBy)}?lang=${entry.code}`,
    current: entry.code === current,
  }));
}
