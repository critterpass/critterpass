/**
 * Where the media ingest downloads from, on recorded Mapillary answers (test/fixtures/mapillary):
 * a stock file keeps its batch's link; a Mapillary image is asked for by its id with the worker's
 * token; an image that is gone is unusable, and a missing token or a refusal is tried again.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { downloadUrl, UnusableMediaError } from '../../src/jobs/media/source-url';

interface Recording {
  status: number;
  body: unknown;
}

function recorded(name: string): Recording {
  const file = path.join(import.meta.dirname, '..', 'fixtures', 'mapillary', `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Recording;
}

function replay(recording: Recording): { fetch: typeof fetch; calls: [string, RequestInit][] } {
  const calls: [string, RequestInit][] = [];
  const replayed: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push([url, init ?? {}]);
    return Promise.resolve(
      new Response(JSON.stringify(recording.body), { status: recording.status }),
    );
  };
  return { fetch: replayed, calls };
}

const street = {
  source: 'mapillary',
  source_id: '137035265111155',
  download_url: 'https://scontent.example.fbcdn.net/expired.jpg',
};

describe('the file an asset is downloaded from', () => {
  it('is the link the batch named, for stock and Commons files', async () => {
    const { fetch: never, calls } = replay(recorded('image-gone'));
    const stock = { source: 'pexels', source_id: '1', download_url: 'https://images.test/1.jpg' };
    expect(await downloadUrl(never, stock, undefined)).toBe('https://images.test/1.jpg');
    expect(calls).toEqual([]);
  });

  it('is the link Mapillary gives the image today, asked with the token', async () => {
    const { fetch: answered, calls } = replay(recorded('image-137035265111155'));
    const url = await downloadUrl(answered, street, 'token-under-test');
    expect(url).toMatch(/^https:\/\/scontent\..+\.jpg/u);
    expect(url).not.toBe(street.download_url);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('https://graph.mapillary.com/137035265111155?fields=thumb_2048_url');
    expect(new Headers(calls[0]?.[1].headers).get('authorization')).toBe('OAuth token-under-test');
  });

  it('marks an image Mapillary no longer has as unusable', async () => {
    const { fetch: gone } = replay(recorded('image-gone'));
    await expect(downloadUrl(gone, street, 'token-under-test')).rejects.toBeInstanceOf(
      UnusableMediaError,
    );
    await expect(
      downloadUrl(gone, { ...street, source_id: '../me' }, 'token-under-test'),
    ).rejects.toBeInstanceOf(UnusableMediaError);
  });

  it('tries again later without a token or when Mapillary refuses', async () => {
    const { fetch: answered, calls } = replay(recorded('image-137035265111155'));
    const missing = downloadUrl(answered, street, undefined);
    await expect(missing).rejects.toThrow(/MAPILLARY_TOKEN/u);
    await expect(missing).rejects.not.toBeInstanceOf(UnusableMediaError);
    expect(calls).toEqual([]);
    const refused = replay({ status: 401, body: { error: { code: 190 } } });
    const again = downloadUrl(refused.fetch, street, 'token-under-test');
    await expect(again).rejects.toThrow(/HTTP 401/u);
    await expect(again).rejects.not.toBeInstanceOf(UnusableMediaError);
  });
});
