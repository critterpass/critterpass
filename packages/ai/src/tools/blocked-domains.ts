/**
 * Supplier, OTA, metasearch and map pages the guide's web search must never read (docs/product-decisions.md:
 * supplier content never reaches the LLM; map pages come from our own map stack). Two layers:
 *
 * - `SUPPLIER_BLOCKED_DOMAINS`: concrete domains sent to the search provider as its exclusion
 *   list (providers match exact domains and their subdomains);
 * - `isBlockedUrl`: the code-side screen every returned URL passes, which matches a brand on any
 *   registrable domain it uses (agoda.com, agoda.co.id, booking.com.vn, expedia.co.jp…), so a
 *   regional site the provider list missed is still dropped, plus Google Maps pages.
 */

/** Brands blocked on every country domain, matched as the label before the public suffix. */
export const SUPPLIER_BRANDS = [
  'agoda',
  'booking',
  'trip',
  'ctrip',
  'traveloka',
  'tiket',
  '12go',
  'klook',
  'kkday',
  'viator',
  'getyourguide',
  'expedia',
  'hotels',
  'airbnb',
  'tripadvisor',
  'kiwitaxi',
  'gettransfer',
  'kayak',
  'trivago',
  'hotelscombined',
  'skyscanner',
  'momondo',
  'priceline',
  'hostelworld',
  'vrbo',
] as const;

/** Concrete domains for provider-side exclusion (a provider list takes exact domains). */
export const SUPPLIER_BLOCKED_DOMAINS = [
  'agoda.com',
  'booking.com',
  'trip.com',
  'ctrip.com',
  'traveloka.com',
  'tiket.com',
  '12go.asia',
  '12go.co',
  'klook.com',
  'kkday.com',
  'viator.com',
  'getyourguide.com',
  'expedia.com',
  'expedia.co.jp',
  'expedia.com.sg',
  'expedia.co.th',
  'expedia.com.au',
  'expedia.co.uk',
  'hotels.com',
  'airbnb.com',
  'airbnb.co.id',
  'airbnb.com.vn',
  'airbnb.co.uk',
  'airbnb.com.au',
  'tripadvisor.com',
  'tripadvisor.com.vn',
  'tripadvisor.co.id',
  'tripadvisor.co.uk',
  'tripadvisor.com.sg',
  'tripadvisor.jp',
  'kiwitaxi.com',
  'gettransfer.com',
  'kayak.com',
  'trivago.com',
  'hotelscombined.com',
  'skyscanner.com',
  'skyscanner.net',
  'momondo.com',
  'priceline.com',
  'hostelworld.com',
  'vrbo.com',
  'maps.google.com',
  'maps.app.goo.gl',
] as const;

/** Second-level labels that sit inside a country suffix (`co.id`, `com.vn`, `ne.jp`…). */
const SUFFIX_SECOND_LEVEL = new Set([
  'com',
  'co',
  'net',
  'org',
  'or',
  'ne',
  'ac',
  'go',
  'gov',
  'edu',
]);

/** The registrable label: the one before the public suffix (`booking` in `m.booking.com.vn`). */
function brandLabel(host: string): string | undefined {
  const labels = host.split('.').filter((label) => label.length > 0);
  if (labels.length < 2) return undefined;
  const tld = labels.at(-1) ?? '';
  const second = labels.at(-2) ?? '';
  const inCountrySuffix = tld.length === 2 && SUFFIX_SECOND_LEVEL.has(second) && labels.length >= 3;
  return inCountrySuffix ? labels.at(-3) : second;
}

function isGoogleMaps(host: string, path: string): boolean {
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && path.startsWith('/maps'))) return true;
  const labels = host.split('.');
  if (labels.includes('maps') && brandLabel(host) === 'google') return true;
  return brandLabel(host) === 'google' && path.startsWith('/maps');
}

/** True when `url` is a supplier, OTA or map page, on any of the brand's domains. */
export function isBlockedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // An unparseable source cannot be shown to be safe.
    return true;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  const brand = brandLabel(host);
  if (brand !== undefined && (SUPPLIER_BRANDS as readonly string[]).includes(brand)) return true;
  return isGoogleMaps(host, parsed.pathname);
}
