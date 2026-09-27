import { describe, expect, it, vi } from 'vitest';

import { exportTranslations, importKeys, loadTolgeeConfig } from './tolgee-client.js';

describe('loadTolgeeConfig', () => {
  it('is undefined when the api key or project id is missing', () => {
    expect(loadTolgeeConfig({})).toBeUndefined();
    expect(loadTolgeeConfig({ TOLGEE_API_KEY: 'key' })).toBeUndefined();
    expect(loadTolgeeConfig({ TOLGEE_PROJECT_ID: '1' })).toBeUndefined();
  });

  it('defaults the api url to the hosted Tolgee instance', () => {
    expect(loadTolgeeConfig({ TOLGEE_API_KEY: 'key', TOLGEE_PROJECT_ID: '1' })).toEqual({
      apiUrl: 'https://app.tolgee.io',
      apiKey: 'key',
      projectId: '1',
    });
  });

  it('respects a self-hosted api url override', () => {
    expect(
      loadTolgeeConfig({ TOLGEE_API_KEY: 'key', TOLGEE_PROJECT_ID: '1', TOLGEE_API_URL: 'https://tolgee.example.com' }),
    ).toEqual({ apiUrl: 'https://tolgee.example.com', apiKey: 'key', projectId: '1' });
  });
});

const config = { apiUrl: 'https://tolgee.example.com', apiKey: 'test-key', projectId: 'proj-1' };

describe('importKeys', () => {
  it('posts the keys with the project API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await importKeys(config, [{ name: 'common.retry.label', namespace: 'common', translations: { en: 'Try again' } }], fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tolgee.example.com/v2/projects/proj-1/keys/import',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-API-Key': 'test-key', 'Content-Type': 'application/json' },
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      keys: [{ name: 'common.retry.label', namespace: 'common', translations: { en: 'Try again' } }],
    });
  });

  it('throws with the response body on a non-2xx status (a recorded-shape error response)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"invalid API key"}', { status: 401, statusText: 'Unauthorized' }));

    await expect(importKeys(config, [], fetchMock)).rejects.toThrow(/401.*invalid API key/s);
  });
});

describe('exportTranslations', () => {
  it('requests a PO-format export with the api key header and returns the raw bytes', async () => {
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // a real zip file's local-file-header signature
    const fetchMock = vi.fn().mockResolvedValue(new Response(zipBytes, { status: 200 }));

    const result = await exportTranslations(config, { languages: ['vi', 'ja'], filterState: ['TRANSLATED'] }, fetchMock);

    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe('https://tolgee.example.com/v2/projects/export');
    expect(url.searchParams.get('format')).toBe('PO');
    expect(url.searchParams.getAll('languages')).toEqual(['vi', 'ja']);
    expect(url.searchParams.getAll('filterState')).toEqual(['TRANSLATED']);
    expect((options.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
    expect(new Uint8Array(result)).toEqual(zipBytes);
  });

  it('throws on a non-2xx status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }));

    await expect(exportTranslations(config, {}, fetchMock)).rejects.toThrow(/404/);
  });
});
