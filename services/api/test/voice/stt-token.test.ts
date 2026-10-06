/**
 * The Deepgram token grant behind `POST /v1/stt/token`: the account key stays on the server, the
 * app gets a 60-second bearer token, and any upstream failure is `SUPPLIER_UNAVAILABLE`.
 */
import { DomainError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { deepgramTokenMinter, STT_TOKEN_TTL_SECONDS } from '../../src/routes/stt-token';

/** Deepgram's documented grant answer: a JWT and its lifetime in seconds. */
const GRANT = { access_token: 'eyJhbGciOiJIUzI1NiJ9.grant.signature', expires_in: 60 };

function recordingFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe('deepgramTokenMinter', () => {
  it('asks the grant endpoint for a 60-second token with the account key', async () => {
    const { calls, fetchImpl } = recordingFetch(() => Response.json(GRANT));
    const token = await deepgramTokenMinter('dg-key', fetchImpl, () => Date.UTC(2026, 9, 6, 5))();
    expect(token).toEqual({
      token: GRANT.access_token,
      scheme: 'bearer',
      expires_at: '2026-10-06T05:01:00.000Z',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.deepgram.com/v1/auth/grant');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(
      'Token dg-key',
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      ttl_seconds: STT_TOKEN_TTL_SECONDS,
    });
  });

  it.each([
    ['an error status', () => new Response('{"err_code":"FORBIDDEN"}', { status: 403 })],
    ['a body without a token', () => Response.json({ expires_in: 60 })],
  ])('answers SUPPLIER_UNAVAILABLE for %s', async (_label, response) => {
    const { fetchImpl } = recordingFetch(response);
    const minted = deepgramTokenMinter('dg-key', fetchImpl)();
    await expect(minted).rejects.toBeInstanceOf(DomainError);
    await expect(minted).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });
  });

  it('answers SUPPLIER_UNAVAILABLE when Deepgram cannot be reached', async () => {
    const offline = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    await expect(deepgramTokenMinter('dg-key', offline)()).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
    });
  });
});
