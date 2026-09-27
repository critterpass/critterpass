import { describe, expect, it } from 'vitest';

import {
  fetchFoursquareLiveStatus,
  shouldRunLiveCheck,
  type LiveCheckHttpClient,
} from '../../src/places/live-check';

const CONFIG = { apiKey: 'test-key' };

interface FakeResponseInit {
  readonly ok?: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

function fakeClient({ ok = true, status = 200, body = {} }: FakeResponseInit): LiveCheckHttpClient {
  return {
    fetch: () => Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response),
  };
}

describe('shouldRunLiveCheck', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('is true when there has never been a check', () => {
    expect(shouldRunLiveCheck(null, now)).toBe(true);
  });

  it('is false within the 24h debounce window', () => {
    expect(shouldRunLiveCheck(new Date('2026-09-27T00:00:01Z'), now)).toBe(false);
  });

  it('is true exactly at and past the 24h debounce window', () => {
    expect(shouldRunLiveCheck(new Date('2026-09-26T12:00:00Z'), now)).toBe(true);
    expect(shouldRunLiveCheck(new Date('2026-09-26T11:00:00Z'), now)).toBe(true);
  });
});

describe('fetchFoursquareLiveStatus', () => {
  it('reads open_now and treats a null date_closed as not permanently closed', async () => {
    const client = fakeClient({ body: { hours: { open_now: true }, date_closed: null } });
    const result = await fetchFoursquareLiveStatus('fsq-1', CONFIG, client);
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ isOpenNow: true, closedPermanently: false, gated: false });
  });

  it('treats a set date_closed as permanently closed', async () => {
    const client = fakeClient({ body: { hours: { open_now: false }, date_closed: '2026-01-01' } });
    const result = await fetchFoursquareLiveStatus('fsq-1', CONFIG, client);
    expect(result.closedPermanently).toBe(true);
  });

  it('degrades to gated:true on the real account-credits 429 (recorded response shape)', async () => {
    // Recorded shape from a real call against the project's Foursquare key (2026-09-27): requesting
    // the billed `hours` field 429s with exactly this message when the account has no credits.
    const client = fakeClient({
      ok: false,
      status: 429,
      body: {
        message:
          "Your account has no API credits remaining. Please visit your organization's billing page at https://foursquare.com/developers/orgs to manually add credits or enable automatic payments. Purchasing credits is required if you are trying to make Premium calls or you have exceeded your freePro tier limit.",
      },
    });
    const result = await fetchFoursquareLiveStatus('fsq-1', CONFIG, client);
    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ isOpenNow: null, closedPermanently: false, gated: true });
  });

  it('throws RATE_LIMITED on an ordinary 429 (not the credits-gate message)', async () => {
    const client = fakeClient({ ok: false, status: 429, body: { message: 'Too many requests' } });
    await expect(fetchFoursquareLiveStatus('fsq-1', CONFIG, client)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('throws UPSTREAM_TIMEOUT on a server error', async () => {
    const client = fakeClient({ ok: false, status: 503 });
    await expect(fetchFoursquareLiveStatus('fsq-1', CONFIG, client)).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
  });
});
