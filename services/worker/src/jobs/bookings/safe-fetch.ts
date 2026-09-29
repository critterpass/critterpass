/**
 * Fetching a pasted confirmation link once, without letting a paste reach anything but a booking
 * site (SSRF controls):
 * - only https/http links on the supplier allow-list (booking sites and airlines) are fetched;
 *   anything else is read as plain text by the caller;
 * - every hostname is resolved first and refused when any address is private, loopback,
 *   link-local (cloud metadata included), carrier-grade NAT, multicast or unspecified, and the
 *   connection is pinned to the address that was checked (no second lookup to rebind);
 * - redirects are followed by hand, at most three, each re-checked against the allow-list;
 * - no cookies or credentials are sent, the body is cut off above 2 MB, and the whole fetch has
 *   20 seconds. Nothing fetched is stored.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';

import { BOOKING_SENDER_DOMAINS } from '@cp/domain';

export const MAX_FETCH_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 3;

/** Booking sites and airlines (the sender list less the generic marketplaces). */
export const PASTE_ALLOWED_DOMAINS: readonly string[] = Object.entries(BOOKING_SENDER_DOMAINS)
  .filter(([, supplier]) => supplier !== 'other')
  .map(([domain]) => domain);

export function isAllowListed(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return PASTE_ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function ipv4Blocked(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Whether an address is anything but a public unicast one. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4Blocked(address);
  if (family !== 6) return true;
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(lower)?.[1];
  if (mapped !== undefined) return ipv4Blocked(mapped);
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('ff') ||
    lower.startsWith('64:ff9b:') ||
    lower.startsWith('2001:db8')
  );
}

export interface FetchedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface SafeFetchDeps {
  /** Every address a hostname resolves to. */
  readonly lookup: (host: string) => Promise<string[]>;
  /** One GET to `url`, connecting to `address` only (the network boundary). */
  readonly transport: (url: URL, address: string, signal: AbortSignal) => Promise<FetchedResponse>;
}

export type SafeFetchResult =
  | {
      readonly kind: 'ok';
      readonly body: string;
      readonly contentType: string;
      readonly url: string;
    }
  | {
      readonly kind: 'refused';
      readonly reason:
        | 'not_allowed'
        | 'private_address'
        | 'redirect_off_list'
        | 'too_many_redirects'
        | 'too_large'
        | 'bad_status'
        | 'unsupported_type'
        | 'failed';
    };

async function readCapped(
  body: AsyncIterable<Uint8Array>,
  max: number,
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > max) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function safeFetch(raw: string, deps: SafeFetchDeps): Promise<SafeFetchResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'refused', reason: 'not_allowed' };
  }
  if (!isAllowListed(url)) return { kind: 'refused', reason: 'not_allowed' };
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const host = url.hostname.replace(/^\[|\]$/gu, '');
      const addresses = isIP(host) === 0 ? await deps.lookup(host) : [host];
      if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
        return { kind: 'refused', reason: 'private_address' };
      }
      const response = await deps.transport(url, addresses[0] as string, signal);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers['location'];
        if (location === undefined) return { kind: 'refused', reason: 'bad_status' };
        const next = new URL(location, url);
        if (!isAllowListed(next)) return { kind: 'refused', reason: 'redirect_off_list' };
        url = next;
        continue;
      }
      if (response.status !== 200) return { kind: 'refused', reason: 'bad_status' };
      const contentType = (response.headers['content-type'] ?? '').toLowerCase();
      if (!/^text\/(html|plain)|^application\/(xhtml\+xml|ld\+json)/u.test(contentType)) {
        return { kind: 'refused', reason: 'unsupported_type' };
      }
      const declared = Number(response.headers['content-length'] ?? '0');
      if (declared > MAX_FETCH_BYTES) return { kind: 'refused', reason: 'too_large' };
      const bytes = await readCapped(response.body, MAX_FETCH_BYTES);
      if (bytes === null) return { kind: 'refused', reason: 'too_large' };
      return {
        kind: 'ok',
        body: new TextDecoder().decode(bytes),
        contentType,
        url: url.toString(),
      };
    }
    return { kind: 'refused', reason: 'too_many_redirects' };
  } catch {
    return { kind: 'refused', reason: 'failed' };
  }
}

/** The real boundary: system DNS, and a GET pinned to the checked address, sending no cookies. */
export const nodeFetchDeps: SafeFetchDeps = {
  lookup: async (host) => (await dnsLookup(host, { all: true })).map((entry) => entry.address),
  transport: (url, address, signal) =>
    new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          method: 'GET',
          signal,
          headers: {
            'user-agent': 'CritterPass-Import/1.0 (+https://critterpass.app)',
            accept: 'text/html,text/plain;q=0.9',
          },
          lookup: (_host, _options, callback) => {
            callback(null, address, isIP(address));
          },
        },
        (response) => {
          resolve({
            status: response.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(', ') : value,
              ]),
            ),
            body: response,
          });
        },
      );
      request.on('error', reject);
      request.end();
    }),
};
