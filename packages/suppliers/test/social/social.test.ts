/**
 * The social link readers against recorded platform answers: TikTok's oEmbed caption (recorded
 * 2026-10-04; the @balibites post keeps that recording's shape), YouTube oEmbed (recorded) plus the
 * Data API description, Instagram asking for a screenshot without caption text, maps links parsed
 * with no request, and a Google short link resolved from its redirect header alone.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyLink,
  parseAppleMapsUrl,
  parseGoogleMapsUrl,
  previewLink,
  readLink,
  type LinkReaderDeps,
} from '../../src/social';
import { recordedFetch, type RecordedRoute } from '../helpers/recorded-fetch';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const ALL = ['tiktok', 'youtube', 'instagram', 'apple_maps', 'google_maps'] as const;
const BALIBITES = 'https://www.tiktok.com/@balibites/video/7421993381244522760';
const RICK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const routes: RecordedRoute[] = [
  { path: '/oembed', params: { url: BALIBITES }, file: 'tiktok-oembed-balibites.json' },
  {
    path: '/oembed',
    params: { url: 'https://www.tiktok.com/@nobody/video/1' },
    file: 'tiktok-oembed-not-found.json',
    status: 400,
  },
  { path: '/oembed', params: { url: RICK, format: 'json' }, file: 'youtube-oembed.json' },
  { path: '/youtube/v3/videos', params: { id: 'dQw4w9WgXcQ' }, file: 'youtube-videos-list.json' },
];

function deps(extra: Partial<LinkReaderDeps> = {}) {
  const recorded = recordedFetch(FIXTURES, routes);
  return { recorded, deps: { fetch: recorded.fetch, platforms: ALL, ...extra } };
}

describe('classifyLink', () => {
  it('names the platform from the host and path', () => {
    const platform = (url: string) => classifyLink(url)?.platform ?? null;
    expect(platform('https://vm.tiktok.com/ZMabc/')).toBe('tiktok');
    expect(platform('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(platform('https://www.instagram.com/p/Cabc/')).toBe('instagram');
    expect(platform('https://www.google.com/maps/place/Tibumana')).toBe('google_maps');
    expect(classifyLink('https://maps.app.goo.gl/AbC123')?.short).toBe(true);
    expect(platform('https://maps.apple.com/?q=Tibumana')).toBe('apple_maps');
    expect(platform('https://example.com/bali-guide')).toBe('web');
    expect(platform('not a link')).toBeNull();
    expect(platform('ftp://example.com/file')).toBeNull();
  });
});

describe('readLink', () => {
  it('reads a TikTok caption, author and thumbnail from oEmbed', async () => {
    const { deps: d } = deps();
    const read = await readLink(BALIBITES, d);
    expect(read.kind).toBe('post');
    if (read.kind !== 'post') return;
    expect(read.post.author).toBe('Bali Bites');
    expect(read.post.text).toContain('Tukad Cepung');
    expect(read.post.text).toContain('the swing with the view');
    expect(read.post.thumbUrl).toMatch(/^https:\/\//u);
  });

  it('adds the YouTube description only when a Data API key is set', async () => {
    const without = deps();
    const plain = await readLink(RICK, without.deps);
    expect(plain.kind === 'post' && plain.post.text).toBe(
      'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
    );
    expect(without.recorded.requests).toHaveLength(1);
    const keyed = deps({ youtubeApiKey: 'yt-key' });
    const full = await readLink(RICK, keyed.deps);
    expect(full.kind === 'post' && full.post.text).toContain('The official video');
    expect(keyed.recorded.requests[1]?.url.searchParams.get('part')).toBe('snippet');
  });

  it('asks for a screenshot for Instagram without caption text, with no request', async () => {
    const { recorded, deps: d } = deps();
    expect((await readLink('https://www.instagram.com/p/Cabc/', d)).kind).toBe('needs_screenshot');
    expect(recorded.requests).toHaveLength(0);
  });

  it('answers unsupported for a web page and for a platform the config leaves out', async () => {
    const { recorded, deps: d } = deps({ platforms: ['youtube'] });
    expect(await readLink(BALIBITES, d)).toEqual({ kind: 'unsupported', platform: 'tiktok' });
    expect((await readLink('https://example.com/x', d)).kind).toBe('unsupported');
    expect(recorded.requests).toHaveLength(0);
  });

  it('calls a private or deleted post unreadable', async () => {
    const { deps: d } = deps();
    expect(await readLink('https://www.tiktok.com/@nobody/video/1', d)).toEqual({
      kind: 'unreadable',
      platform: 'tiktok',
      reason: 'not_found',
    });
  });

  it('resolves a Google short link from its Location header alone', async () => {
    const seen: RequestInit[] = [];
    const fetch = (_url: string, init?: RequestInit) => {
      seen.push(init ?? {});
      return Promise.resolve(
        new Response('<html>a page nobody reads</html>', {
          status: 302,
          headers: {
            location:
              'https://www.google.com/maps/place/Tibumana+Waterfall/@-8.5136,115.3218,17z/data=!3m1',
          },
        }),
      );
    };
    const read = await readLink('https://maps.app.goo.gl/AbC123', { fetch, platforms: ALL });
    expect(read).toEqual({
      kind: 'map',
      platform: 'google_maps',
      place: { name: 'Tibumana Waterfall', point: { lat: -8.5136, lng: 115.3218 } },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.redirect).toBe('manual');
  });
});

describe('maps links without a request', () => {
  it('parses Google place, q and query forms', () => {
    const google = (url: string) => parseGoogleMapsUrl(new URL(url));
    expect(google('https://www.google.com/maps/place/Tukad+Cepung/@-8.4456,115.3877,15z')).toEqual({
      name: 'Tukad Cepung',
      point: { lat: -8.4456, lng: 115.3877 },
    });
    expect(google('https://maps.google.com/?q=-8.51,115.26')).toEqual({
      name: null,
      point: { lat: -8.51, lng: 115.26 },
    });
    expect(google('https://www.google.com/maps/search/?api=1&query=Sari%20Organik')?.name).toBe(
      'Sari Organik',
    );
    expect(google('https://www.google.com/maps')).toBeNull();
  });

  it('parses Apple q, ll and address', () => {
    const apple = (url: string) => parseAppleMapsUrl(new URL(url));
    expect(apple('https://maps.apple.com/?q=Tibumana&ll=-8.5136,115.3218')).toEqual({
      name: 'Tibumana',
      point: { lat: -8.5136, lng: 115.3218 },
    });
    expect(apple('https://maps.apple.com/?address=Jl.%20Raya%20Ubud')?.name).toBe('Jl. Raya Ubud');
  });
});

describe('previewLink', () => {
  it('answers oEmbed fields only, and a maps name from the URL', async () => {
    const { recorded, deps: d } = deps({ youtubeApiKey: 'yt-key' });
    expect(await previewLink(RICK, d)).toMatchObject({
      platform: 'youtube',
      author: 'Rick Astley',
    });
    expect(recorded.requests.map((request) => request.url.pathname)).toEqual(['/oembed']);
    expect(
      await previewLink('https://www.google.com/maps/place/Tukad+Cepung/@-8.4,115.3,15z', d),
    ).toEqual({ platform: 'google_maps', title: 'Tukad Cepung', author: null, thumbUrl: null });
  });
});
