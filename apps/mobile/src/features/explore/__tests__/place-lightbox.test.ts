import { describe, expect, it } from '@jest/globals';

import type { MediaView } from '@/lib/media/variants';

import { heroCreditOf, heroPhotoItems, livePhotoItems, profilePhotoItems } from '../place-lightbox';

const FOURSQUARE = { name: 'Foursquare', url: 'https://foursquare.com' };

const own: MediaView = {
  id: 'asset-9',
  kind: 'photo',
  blurhash: '',
  images: [{ url: 'https://cdn.test/9/1242.webp', w: 1242, h: 828 }],
  videos: [],
  credit: 'Minh Anh · Foursquare',
  attribution_required: true,
};

describe("a place's photos in the full-screen viewer", () => {
  it('credits each found photo to the site it is from', () => {
    expect(
      profilePhotoItems([
        { url: 'https://img.test/a.jpg', sourcePage: 'https://www.vietnam.travel/da-nang' },
        { url: 'https://img.test/b.jpg', sourcePage: '' },
      ]),
    ).toEqual([
      {
        key: 'https://img.test/a.jpg',
        kind: 'image',
        uri: 'https://img.test/a.jpg',
        credit: 'vietnam.travel',
      },
      {
        key: 'https://img.test/b.jpg',
        kind: 'image',
        uri: 'https://img.test/b.jpg',
        credit: undefined,
      },
    ]);
  });

  it('credits every live photo to Foursquare', () => {
    const items = livePhotoItems(
      [
        { url: 'https://fsq.test/1.jpg', width: 3, height: 2 },
        { url: 'https://fsq.test/2.jpg', width: 3, height: 2 },
      ],
      FOURSQUARE,
    );
    expect(items.map((item) => item.credit)).toEqual(['Foursquare', 'Foursquare']);
    expect(items.map((item) => item.key)).toEqual([
      'https://fsq.test/1.jpg',
      'https://fsq.test/2.jpg',
    ]);
  });

  it("opens the place's own photo with its author", () => {
    expect(
      heroPhotoItems({
        photo: own,
        generic: false,
        heroUrl: null,
        heroCredit: undefined,
        pixels: 1170,
      }),
    ).toEqual([
      {
        key: 'asset-9',
        kind: 'image',
        uri: 'https://cdn.test/9/1242.webp',
        credit: 'Minh Anh · Foursquare',
      },
    ]);
  });

  it('opens nothing for a stock photo standing in for the place', () => {
    expect(
      heroPhotoItems({
        photo: own,
        generic: true,
        heroUrl: null,
        heroCredit: undefined,
        pixels: 1170,
      }),
    ).toEqual([]);
  });

  it('opens the live photo standing in for the hero with where it is from', () => {
    expect(
      heroPhotoItems({
        photo: null,
        generic: false,
        heroUrl: 'https://fsq.test/hero.jpg',
        heroCredit: 'Foursquare',
        pixels: 1170,
      }),
    ).toEqual([
      {
        key: 'https://fsq.test/hero.jpg',
        kind: 'image',
        uri: 'https://fsq.test/hero.jpg',
        credit: 'Foursquare',
      },
    ]);
    expect(
      heroPhotoItems({
        photo: null,
        generic: false,
        heroUrl: null,
        heroCredit: undefined,
        pixels: 1170,
      }),
    ).toEqual([]);
  });

  it('names where the standing-in hero is from', () => {
    const details = {
      rating: null,
      photos: [],
      tips: [],
      website: null,
      phone: null,
      attribution: FOURSQUARE,
    };
    expect(heroCreditOf({ heroUrl: 'https://fsq.test/hero.jpg', details }, [])).toBe('Foursquare');
    expect(
      heroCreditOf({ heroUrl: null, details: null }, [{ sourcePage: 'https://danang.gov.vn/x' }]),
    ).toBe('danang.gov.vn');
    expect(heroCreditOf({ heroUrl: null, details: null }, [])).toBeUndefined();
  });
});
