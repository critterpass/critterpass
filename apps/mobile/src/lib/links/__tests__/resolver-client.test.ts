import { describe, expect, it } from '@jest/globals';

import { createLinkResolverClient } from '../resolver-client';
import { fakeLinksHttp, FIXTURES, standardRoutes } from '../test-support/fake-links-http';

const DEVICE = {
  id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09',
  platform: 'ios' as const,
  app_version: '1.0.0',
  tz: 'Asia/Ho_Chi_Minh',
};

describe('link resolver client', () => {
  it('previews invite codes and reports unknown ones', async () => {
    const { http, requests } = fakeLinksHttp(standardRoutes);
    const client = createLinkResolverClient(http);
    await expect(client.preview({ kind: 'invite', code: 'BAX6XA' })).resolves.toEqual({
      status: 'found',
      preview: FIXTURES.previewActiveInvite,
    });
    await expect(client.preview({ kind: 'referral', code: 'ZZZZ2K' })).resolves.toEqual({
      status: 'not_found',
    });
    expect(requests.map((request) => request.path)).toEqual([
      '/v1/links/BAX6XA/preview?kind=invite',
      '/v1/links/ZZZZ2K/preview?kind=referral',
    ]);
    await expect(client.preview({ kind: 'guide', slug: 'lundi' })).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('sends a claim_attribution envelope and returns the claim result', async () => {
    const { http, requests } = fakeLinksHttp(standardRoutes);
    const result = await createLinkResolverClient(http).claim(
      { pasted_url: 'https://critterpass.app/i/BAX6XD' },
      DEVICE,
    );
    expect(result).toEqual({ status: 'claimed', result: FIXTURES.claimApplied.result });
    expect(requests[0]?.body).toMatchObject({
      cmd: 'claim_attribution',
      v: 1,
      device: DEVICE,
      payload: { pasted_url: 'https://critterpass.app/i/BAX6XD' },
    });
  });

  it('turns rejects, throttling and network loss into values', async () => {
    const rejected = fakeLinksHttp(() => ({ status: 422, body: FIXTURES.claimCodeInvalid }));
    await expect(
      createLinkResolverClient(rejected.http).claim({ join_code: 'ZZZZ2K' }, DEVICE),
    ).resolves.toEqual({ status: 'rejected', code: 'CODE_INVALID' });
    const throttled = fakeLinksHttp(() => ({ status: 429, body: {} }));
    await expect(
      createLinkResolverClient(throttled.http).claim({ join_code: 'ZZZZ2K' }, DEVICE),
    ).resolves.toEqual({ status: 'unavailable' });
    const offline = createLinkResolverClient({
      request: () => Promise.reject(new Error('offline')),
    });
    await expect(offline.claim({ join_code: 'ZZZZ2K' }, DEVICE)).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(offline.preview({ kind: 'invite', code: 'BAX6XA' })).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
