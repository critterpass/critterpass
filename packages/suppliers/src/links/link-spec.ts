/**
 * What a partner link points at, as the api hands it to the link builders: a stay search, an
 * activity, or an airport transfer, for a place name and the trip's dates. A partner page URL
 * from curated data is used as-is when it is on the partner's own domain.
 */
import type { DeepLinkKind } from '../core/adapter';

export interface LinkTarget {
  readonly kind: DeepLinkKind;
  /** Place, property or product name the partner's search understands. */
  readonly query: string;
  readonly checkIn?: string;
  readonly checkOut?: string;
  readonly date?: string;
  readonly adults?: number;
  readonly rooms?: number;
  /** A page on the partner's own site (curated data). */
  readonly pageUrl?: string;
}

/** The page URL when it is https on one of `hosts` (or a subdomain), else null. */
export function partnerPage(target: LinkTarget, hosts: readonly string[]): string | null {
  if (target.pageUrl === undefined) return null;
  let url: URL;
  try {
    url = new URL(target.pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const onHost = hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  return onHost ? url.toString() : null;
}

/** Builds `base` with the defined params set (undefined ones skipped). */
export function withParams(
  base: string,
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
