/**
 * The query of an in-app route (`/app/recap/<id>/postcard?postcard_id=…`,
 * `critterpass://wallet/mailbox/connected?provider=gmail&status=connected`). It reaches the screen
 * as route params, so it is kept in one canonical form: plain parameter names, values re-encoded,
 * the fragment dropped, and bounded in size. `c` is the share channel on every link and never a
 * route param. A query that does not fit is dropped whole; the route still opens.
 */
const APP_SEARCH_MAX_LENGTH = 1024;
const APP_SEARCH_MAX_PARAMS = 16;
const APP_SEARCH_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const CHANNEL_PARAM = 'c';

function decodeQueryPart(part: string): string | null {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** The canonical query (no leading `?`) of a raw one, or undefined when there is none to keep. */
export function appSearchOf(raw: string): string | undefined {
  const query = (raw.split('#')[0] ?? '').replace(/^\?/, '');
  if (query === '' || query.length > APP_SEARCH_MAX_LENGTH) return undefined;
  const pairs: string[] = [];
  for (const piece of query.split('&')) {
    if (piece === '') continue;
    const cut = piece.indexOf('=');
    const key = decodeQueryPart(cut === -1 ? piece : piece.slice(0, cut));
    const value = decodeQueryPart(cut === -1 ? '' : piece.slice(cut + 1));
    if (key === null || value === null || !APP_SEARCH_KEY_PATTERN.test(key)) return undefined;
    if (key === CHANNEL_PARAM) continue;
    pairs.push(`${key}=${encodeURIComponent(value)}`);
  }
  if (pairs.length === 0 || pairs.length > APP_SEARCH_MAX_PARAMS) return undefined;
  return pairs.join('&');
}
