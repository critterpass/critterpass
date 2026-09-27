/**
 * Supplier and OTA pages the guide's web search must never read (docs/product-decisions.md:
 * supplier content never reaches the LLM). Sent as `blocked_domains` on every web search request
 * and checked again in code on every result and citation that comes back. Entries are bare domains
 * (subdomains included) or a domain with a path prefix, the form the API accepts.
 */
export const SUPPLIER_BLOCKED_DOMAINS = [
  'agoda.com',
  'booking.com',
  'trip.com',
  'viator.com',
  'klook.com',
  'getyourguide.com',
  'expedia.com',
  'hotels.com',
  'airbnb.com',
  'kiwitaxi.com',
  'gettransfer.com',
  'tripadvisor.com/Hotel_Review',
  'tripadvisor.com/AttractionProductReview',
  'tripadvisor.com/Commerce',
] as const;

interface BlockedEntry {
  readonly host: string;
  readonly pathPrefix: string | null;
}

function parseEntry(entry: string): BlockedEntry {
  const slash = entry.indexOf('/');
  return slash === -1
    ? { host: entry.toLowerCase(), pathPrefix: null }
    : { host: entry.slice(0, slash).toLowerCase(), pathPrefix: entry.slice(slash) };
}

/** True when `url` is on a blocked domain (or one of its subdomains) and under a blocked path. */
export function isBlockedUrl(
  url: string,
  blocked: readonly string[] = SUPPLIER_BLOCKED_DOMAINS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // An unparseable source cannot be shown to be safe.
    return true;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  return blocked.map(parseEntry).some((entry) => {
    const onHost = host === entry.host || host.endsWith(`.${entry.host}`);
    return onHost && (entry.pathPrefix === null || parsed.pathname.startsWith(entry.pathPrefix));
  });
}
