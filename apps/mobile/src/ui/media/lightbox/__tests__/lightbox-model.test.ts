import { describe, expect, it } from '@jest/globals';

import type { MediaView } from '@/lib/media/variants';

import {
  clampIndex,
  counterOf,
  indexOfKey,
  linesOf,
  mediaViewItem,
  pageAt,
  panLimit,
  siteCredit,
  type LightboxItem,
} from '../lightbox-model';

const item = (key: string, extra: Partial<LightboxItem> = {}): LightboxItem => ({
  key,
  kind: 'image',
  uri: `https://img.test/${key}.jpg`,
  ...extra,
});

const asset = (extra: Partial<MediaView> = {}): MediaView => ({
  id: 'asset-1',
  kind: 'photo',
  blurhash: '',
  images: [
    { url: 'https://cdn.test/a/414.webp', w: 414, h: 276 },
    { url: 'https://cdn.test/a/1242.webp', w: 1242, h: 828 },
  ],
  videos: [],
  credit: 'Linh Tran · Unsplash',
  attribution_required: false,
  ...extra,
});

describe('the set and the position in it', () => {
  it('keeps a position inside the set', () => {
    expect(clampIndex(-2, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2.4, 5)).toBe(2);
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
  });

  it('opens on the item tapped, and on the first when it has left the set', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(indexOfKey(items, 'c')).toBe(2);
    expect(indexOfKey(items, 'gone')).toBe(0);
  });

  it('reads the page from where the pager rests', () => {
    expect(pageAt(0, 390, 4)).toBe(0);
    expect(pageAt(780, 390, 4)).toBe(2);
    expect(pageAt(5000, 390, 4)).toBe(3);
    expect(pageAt(100, 0, 4)).toBe(0);
  });

  it('counts from one and says nothing for a single item', () => {
    expect(counterOf(2, 12)).toEqual({ position: 3, total: 12 });
    expect(counterOf(40, 12)).toEqual({ position: 12, total: 12 });
    expect(counterOf(0, 1)).toBeNull();
    expect(counterOf(0, 0)).toBeNull();
  });
});

describe('caption and credit', () => {
  it('shows each line only when it has words', () => {
    expect(linesOf(item('a', { caption: '  Sunset at the pier ', credit: 'Foursquare' }))).toEqual({
      caption: 'Sunset at the pier',
      credit: 'Foursquare',
    });
    expect(linesOf(item('a', { caption: '', credit: '  ' }))).toEqual({
      caption: null,
      credit: null,
    });
    expect(linesOf(item('a'))).toEqual({ caption: null, credit: null });
  });

  it('credits a found photo to the site it is from', () => {
    expect(siteCredit('https://www.VnExpress.net/du-lich/a?b=1')).toBe('vnexpress.net');
    expect(siteCredit('http://example.com')).toBe('example.com');
    expect(siteCredit('')).toBeUndefined();
    expect(siteCredit('not a link')).toBeUndefined();
  });

  it('keeps a licensed photo credit whether or not the licence asks for it', () => {
    expect(mediaViewItem(asset(), 1000)).toEqual({
      key: 'asset-1',
      kind: 'image',
      uri: 'https://cdn.test/a/1242.webp',
      credit: 'Linh Tran · Unsplash',
    });
    expect(mediaViewItem(asset({ credit: ' ' }), 1000)?.credit).toBeUndefined();
  });

  it('shows the copy saved on the phone first', () => {
    const saved = (url: string) => (url.endsWith('1242.webp') ? 'file:///media/1242.webp' : null);
    expect(mediaViewItem(asset(), 1000, saved)?.uri).toBe('file:///media/1242.webp');
  });

  it('plays an asset with a loop as a video over its still', () => {
    const video = asset({
      kind: 'video',
      videos: [{ url: 'https://cdn.test/a/720.mp4', w: 720, h: 1280, bytes: 900_000 }],
    });
    expect(mediaViewItem(video, 1000)).toEqual({
      key: 'asset-1',
      kind: 'video',
      uri: 'https://cdn.test/a/720.mp4',
      poster: 'https://cdn.test/a/1242.webp',
      credit: 'Linh Tran · Unsplash',
    });
  });

  it('has nothing to show for an asset with no files', () => {
    expect(mediaViewItem(asset({ images: [] }), 1000)).toBeNull();
  });
});

describe('dragging a zoomed picture', () => {
  it('stops at the picture edge', () => {
    expect(panLimit(400, 1)).toBe(0);
    expect(panLimit(400, 2)).toBe(200);
    expect(panLimit(400, 0.8)).toBe(0);
  });
});
