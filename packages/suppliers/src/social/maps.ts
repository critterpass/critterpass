/**
 * A place from a maps link, read from the URL itself: Google Maps `/maps/place/<name>/@lat,lng`,
 * `?q=` and `query=`; Apple Maps `q`, `ll`, `address` and `sll`. A Google short link
 * (`maps.app.goo.gl`, `goo.gl/maps`) is resolved by one request that reads only its `Location`
 * redirect header (never the body, never a Google API), then parsed like a full link.
 */
import { SOCIAL_TIMEOUT_MS, SocialReadError, type SocialFetch } from './http';

export interface MapPlace {
  readonly name: string | null;
  readonly point: { readonly lat: number; readonly lng: number } | null;
}

const POINT = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/u;

function pointOf(text: string | null | undefined): MapPlace['point'] {
  const match = POINT.exec(text ?? '');
  if (match === null) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const decode = (text: string) => {
  try {
    return decodeURIComponent(text.replace(/\+/gu, ' ')).trim();
  } catch {
    return text.trim();
  }
};

/** A query is either a point or a name. */
function fromQuery(query: string | null): MapPlace {
  if (query === null || query.trim() === '') return { name: null, point: null };
  const point = pointOf(query);
  return point === null ? { name: query.trim().slice(0, 120), point: null } : { name: null, point };
}

export function parseGoogleMapsUrl(url: URL): MapPlace | null {
  const place = /\/maps\/place\/([^/]+)/u.exec(url.pathname);
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/u.exec(url.pathname);
  const point = at === null ? null : pointOf(`${at[1]},${at[2]}`);
  if (place?.[1] !== undefined) {
    const name = decode(place[1]);
    const asPoint = pointOf(name);
    return asPoint === null ? { name: name.slice(0, 120), point } : { name: null, point: asPoint };
  }
  const query = url.searchParams.get('q') ?? url.searchParams.get('query');
  const parsed = fromQuery(query);
  const merged = { name: parsed.name, point: parsed.point ?? point };
  return merged.name === null && merged.point === null ? null : merged;
}

export function parseAppleMapsUrl(url: URL): MapPlace | null {
  const name = url.searchParams.get('q') ?? url.searchParams.get('address');
  const point = pointOf(url.searchParams.get('ll') ?? url.searchParams.get('sll'));
  const query = fromQuery(name);
  const merged = { name: query.name, point: point ?? query.point };
  return merged.name === null && merged.point === null ? null : merged;
}

/** The full link a Google short link redirects to, from its `Location` header only. */
export async function resolveShortMapsLink(url: URL, fetch: SocialFetch): Promise<URL | null> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(SOCIAL_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SocialReadError('unavailable', `short link failed: ${String(error)}`);
  }
  // Nothing but the header is read; the body is cancelled unread.
  await response.body?.cancel();
  const location = response.headers.get('location');
  if (response.status < 300 || response.status >= 400 || location === null) return null;
  try {
    const target = new URL(location, url);
    const host = target.hostname.replace(/^www\./u, '');
    return /^(maps\.)?google\.[a-z.]+$/u.test(host) ? target : null;
  } catch {
    return null;
  }
}
