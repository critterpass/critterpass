import { describe, expect, it } from 'vitest';

import { fetchCommonsPages } from '../../src/destinations/base/photos';

describe('Commons file-page query', () => {
  it('sends long titles in a form body, so a batch never overflows the URL', async () => {
    const titles = Array.from(
      { length: 50 },
      (_, i) => `File:Thành phố Hồ Chí Minh nhìn từ trên cao về phía sông Sài Gòn ${i}.jpg`,
    );
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchStub = ((url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(new Response(JSON.stringify({ query: { pages: [] } })));
    }) as typeof fetch;

    await fetchCommonsPages(titles, fetchStub);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.init?.method).toBe('POST');
    expect(call?.url).not.toContain('titles=');
    const body = new URLSearchParams(String(call?.init?.body));
    expect(body.get('titles')?.split('|')).toHaveLength(50);
  });
});
