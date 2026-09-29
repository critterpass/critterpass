/**
 * Where the guest guide may read about a place it does not guide (3b-8 "WHAT TOKEK KNOWS SO
 * FAR"): an explicit allow-list, sent to the search provider and re-checked on every result URL.
 * Tourism boards, government travel advisories, Wikivoyage and Wikipedia, and weather and season
 * sources. Supplier and OTA domains (Agoda, Booking, Trip.com, Klook, Viator, GetYourGuide,
 * Expedia, TripAdvisor, …) are never on it, and the supplier blocklist is applied as well.
 */
import { isBlockedUrl } from '../../tools/blocked-domains';

export const GUEST_BRIEF_DOMAINS = [
  // Encyclopaedic and travel wikis.
  'wikivoyage.org',
  'wikipedia.org',
  // Government travel advisories.
  'travel.state.gov',
  'gov.uk',
  'smartraveller.gov.au',
  'travel.gc.ca',
  'safetravels.govt.nz',
  'mfa.gov.sg',
  // National tourism boards.
  'visitmorocco.com',
  'japan.travel',
  'visitportugal.com',
  'indonesia.travel',
  'peru.travel',
  'visiticeland.com',
  'visitmexico.com',
  'vietnam.travel',
  'tourismthailand.org',
  'visitsingapore.com',
  'visitkorea.or.kr',
  'incredibleindia.org',
  'spain.info',
  'italia.it',
  'france.fr',
  'visitgreece.gr',
  'goturkiye.com',
  'egypt.travel',
  'southafrica.net',
  'newzealand.com',
  'australia.com',
  'visitcalifornia.com',
  // Weather and season.
  'weatherspark.com',
  'climate-data.org',
  'metoffice.gov.uk',
  'worldweather.wmo.int',
] as const;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The allow-listed domain `url` belongs to, or null (not allowed, or a blocked supplier). */
export function allowedDomainOf(url: string): string | null {
  const host = hostOf(url);
  if (host === null || isBlockedUrl(url)) return null;
  return (
    GUEST_BRIEF_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null
  );
}
