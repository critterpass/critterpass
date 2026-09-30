import { describe, expect, it } from 'vitest';

import {
  isBlockedAddress,
  MAX_FETCH_BYTES,
  safeFetch,
  type FetchedResponse,
  type SafeFetchDeps,
} from '../../src/jobs/bookings/safe-fetch';

async function* chunks(size: number): AsyncIterable<Uint8Array> {
  const piece = new Uint8Array(64 * 1024).fill(97);
  for (let sent = 0; sent < size; sent += piece.byteLength) {
    await Promise.resolve();
    yield piece;
  }
}

function deps(
  dns: Readonly<Record<string, string[]>>,
  pages: Readonly<Record<string, FetchedResponse>>,
): SafeFetchDeps & { contacted: string[] } {
  const contacted: string[] = [];
  return {
    contacted,
    lookup: (host) => Promise.resolve(dns[host] ?? []),
    transport: (url, address) => {
      contacted.push(`${url.toString()}@${address}`);
      const page = pages[url.toString()];
      return page === undefined ? Promise.reject(new Error('no page')) : Promise.resolve(page);
    },
  };
}

const html = (body: string): FetchedResponse => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: (async function* () {
    await Promise.resolve();
    yield new TextEncoder().encode(body);
  })(),
});

describe('pasted links', () => {
  it('fetches an allow-listed booking page from its public address', async () => {
    const d = deps(
      { 'www.agoda.com': ['203.0.113.10'] },
      { 'https://www.agoda.com/confirm/1': html('<p>Booking ID 1482236907</p>') },
    );
    const result = await safeFetch('https://www.agoda.com/confirm/1', d);
    expect(result).toMatchObject({ kind: 'ok', body: '<p>Booking ID 1482236907</p>' });
    expect(d.contacted).toEqual(['https://www.agoda.com/confirm/1@203.0.113.10']);
  });

  it('refuses the metadata address and localhost without contacting them', async () => {
    const d = deps({ localhost: ['127.0.0.1'] }, {});
    expect(await safeFetch('http://169.254.169.254/latest/meta-data', d)).toEqual({
      kind: 'refused',
      reason: 'not_allowed',
    });
    expect(await safeFetch('http://localhost:8787/v1/admin', d)).toEqual({
      kind: 'refused',
      reason: 'not_allowed',
    });
    expect(d.contacted).toEqual([]);
  });

  it('refuses an allow-listed name that resolves to a private address', async () => {
    const d = deps({ 'www.booking.com': ['203.0.113.7', '10.0.0.5'] }, {});
    expect(await safeFetch('https://www.booking.com/x', d)).toEqual({
      kind: 'refused',
      reason: 'private_address',
    });
    expect(d.contacted).toEqual([]);
  });

  it('refuses a redirect that leaves the allow-list', async () => {
    const d = deps(
      { 'www.klook.com': ['203.0.113.20'] },
      {
        'https://www.klook.com/r': {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
          body: chunks(0),
        },
      },
    );
    expect(await safeFetch('https://www.klook.com/r', d)).toEqual({
      kind: 'refused',
      reason: 'redirect_off_list',
    });
    expect(d.contacted).toHaveLength(1);
  });

  it('refuses a body over 2 MB', async () => {
    const d = deps(
      { 'www.viator.com': ['203.0.113.30'] },
      {
        'https://www.viator.com/big': {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: chunks(MAX_FETCH_BYTES + 128 * 1024),
        },
      },
    );
    expect(await safeFetch('https://www.viator.com/big', d)).toEqual({
      kind: 'refused',
      reason: 'too_large',
    });
  });

  it('classes private, loopback, link-local and mapped addresses as blocked', () => {
    for (const address of [
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress('203.0.113.10')).toBe(false);
    expect(isBlockedAddress('2606:4700::1111')).toBe(false);
  });
});
