import { describe, expect, it } from 'vitest';

import {
  byPlacePhotoPrecedence,
  foursquarePhotoAsset,
  foursquarePhotoImages,
  foursquareStoredPhotos,
  isGenericPlacePhotoSource,
  placeMediaAssetSchema,
  placePhotoTier,
} from '../../src';

// A real Place Details response (Fushimi Inari Taisha, Kyoto), recorded 2026-10-03.
import recorded from './fixtures/foursquare-place-details.json' with { type: 'json' };

describe('foursquareStoredPhotos', () => {
  it('keeps only the photo ids, address parts, sizes and creation times of a recorded answer', () => {
    const photos = foursquareStoredPhotos(recorded);
    expect(photos).toHaveLength(5);
    expect(photos?.[0]).toEqual({
      photoId: '6aa4d40429e2303bf9e55ef7',
      prefix: 'https://fastly.4sqi.net/img/general/',
      suffix: '/1368185932_NJqm6f3sjshDYUemD5zEX4ILxcDOpuE8t4zbKc1qHe0.jpg',
      width: 1440,
      height: 1920,
      createdAt: '2026-09-12T04:24:36.000Z',
    });
    // Nothing of the rest of the answer (hours, rating, tips, website, phone) is in what is kept.
    const kept = JSON.stringify(photos);
    for (const other of [recorded.rating, recorded.tel, recorded.website, recorded.tips[0]?.text]) {
      expect(other).toBeDefined();
      expect(kept).not.toContain(String(other));
    }
    for (const photo of photos ?? []) {
      expect(Object.keys(photo).sort()).toEqual([
        'createdAt',
        'height',
        'photoId',
        'prefix',
        'suffix',
        'width',
      ]);
    }
  });

  it('keeps at most five, drops photos without an id or a usable address, and repeats none', () => {
    const photo = (id: string | undefined, prefix = 'https://fastly.4sqi.net/img/general/') => ({
      ...(id === undefined ? {} : { id }),
      prefix,
      suffix: `/${id ?? 'x'}.jpg`,
      width: 800,
      height: 600,
      tip: { text: 'never kept' },
      classifications: ['outdoor'],
    });
    const photos = foursquareStoredPhotos({
      photos: [
        photo('a'),
        photo(undefined),
        photo('b', 'http://plain.example/'),
        photo('a'),
        photo('c'),
        photo('d'),
        photo('e'),
        photo('f'),
        photo('g'),
      ],
    });
    expect(photos?.map((p) => p.photoId)).toEqual(['a', 'c', 'd', 'e', 'f']);
    expect(JSON.stringify(photos)).not.toMatch(/never kept|outdoor/u);
    expect(photos?.[0]?.createdAt).toBeNull();
  });

  it('tells an answer without a photo list from a place without photos', () => {
    expect(foursquareStoredPhotos({ rating: 9 })).toBeNull();
    expect(foursquareStoredPhotos('nope')).toBeNull();
    expect(foursquareStoredPhotos({ photos: [] })).toEqual([]);
  });
});

describe('foursquarePhotoAsset', () => {
  const photo = {
    prefix: 'https://fastly.4sqi.net/img/general/',
    suffix: '/a.jpg',
    width: 1440,
    height: 1920,
  };

  it('offers a thumb, a card and a hero address, never above the original or a 1080 px edge', () => {
    expect(foursquarePhotoImages(photo)).toEqual([
      { url: 'https://fastly.4sqi.net/img/general/320x427/a.jpg', w: 320, h: 427 },
      { url: 'https://fastly.4sqi.net/img/general/640x853/a.jpg', w: 640, h: 853 },
      { url: 'https://fastly.4sqi.net/img/general/810x1080/a.jpg', w: 810, h: 1080 },
    ]);
    expect(foursquarePhotoImages({ ...photo, width: 400, height: 300 })).toEqual([
      { url: 'https://fastly.4sqi.net/img/general/320x240/a.jpg', w: 320, h: 240 },
      { url: 'https://fastly.4sqi.net/img/general/400x300/a.jpg', w: 400, h: 300 },
    ]);
  });

  it('is a media asset of the place that carries the credit Foursquare requires', () => {
    const asset = foursquarePhotoAsset({
      id: '0199a1b2-0000-7000-8000-000000000001',
      poiId: '0199a1b2-0000-7000-8000-0000000000aa',
      rank: 0,
      photo,
    });
    expect(placeMediaAssetSchema.parse(asset)).toEqual(asset);
    expect(asset).toMatchObject({
      source: 'foursquare',
      subjects: ['poi:0199a1b2-0000-7000-8000-0000000000aa'],
      credit: 'Powered by Foursquare',
      attribution_required: true,
      source_url: 'https://foursquare.com',
    });
  });
});

describe('place photo precedence', () => {
  it('ranks a Commons photo, then Foursquare, then a partner, then generic stock', () => {
    expect(['pexels', 'foursquare', 'wikimedia', 'pixabay'].map(placePhotoTier)).toEqual([
      'generic',
      'foursquare',
      'own',
      'generic',
    ]);
    expect(isGenericPlacePhotoSource('foursquare')).toBe(false);
    expect(isGenericPlacePhotoSource('pexels')).toBe(true);
  });

  it('orders a read so each place leads with its best photo and destinations keep their order', () => {
    const item = (id: string, source: string, subjects: string[]) => ({ id, source, subjects });
    const ordered = byPlacePhotoPrecedence([
      item('stock-a', 'pexels', ['poi:a']),
      item('hero', 'pexels', ['destination:da-nang']),
      item('fsq-a-0', 'foursquare', ['poi:a']),
      item('fsq-a-1', 'foursquare', ['poi:a']),
      item('commons-a', 'wikimedia', ['poi:a']),
      item('second', 'pixabay', ['destination:da-nang']),
      item('fsq-b', 'foursquare', ['poi:b']),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual([
      'hero',
      'commons-a',
      'second',
      'fsq-a-0',
      'fsq-a-1',
      'fsq-b',
      'stock-a',
    ]);
  });
});
