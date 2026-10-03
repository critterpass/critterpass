/**
 * Place photos for the lab's swipe scenes, as `GET /v1/media` returns them: My Khe Beach's own
 * Commons photo (CC BY, so its credit shows), served from Commons' thumbnail host, and a staging
 * stock photo of a Đà Nẵng beach standing in as a generic one (labelled not this place).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { MediaAsset } from '@cp/domain';

const COMMONS =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c0/My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg';
const STOCK = 'https://media.staging.critterpass.app/c/media/01a0f4a2-e2d1-7495-adc0-1b6fc321be89';

export const MY_KHE_OWN: MediaAsset = {
  id: '01a0f4a2-0000-7000-8000-00000000c0c0',
  kind: 'photo',
  subjects: ['poi:my-khe'],
  rank: 0,
  width: 1920,
  height: 1255,
  duration_ms: null,
  colour: null,
  blurhash: 'LaCalRWUV?WXkHfSjWj[5_o#n#of',
  images: [960, 1920].map((w) => ({
    url: `${COMMONS}/${String(w)}px-My_Khe_Beach%2C_Da_Nang%2C_Vietnam.jpg`,
    w,
    h: Math.round((w * 1255) / 1920),
  })),
  videos: [],
  credit: '. Ray in Manila · CC BY 2.0 · Wikimedia Commons',
  attribution_required: true,
  author: '. Ray in Manila',
  source: 'wikimedia',
  source_url: 'https://commons.wikimedia.org/wiki/File:My_Khe_Beach,_Da_Nang,_Vietnam.jpg',
  licence: 'cc-by-2.0',
  licence_url: 'https://creativecommons.org/licenses/by/2.0',
};

export const BEACH_GENERIC: MediaAsset = {
  id: '01a0f4a2-e2d1-7495-adc0-1b6fc321be89',
  kind: 'photo',
  subjects: ['poi:pham-van-dong'],
  rank: 0,
  width: 5881,
  height: 3975,
  duration_ms: null,
  colour: null,
  blurhash: 'LnMkLzxaogt819WCoea}ohj[jZj@',
  images: [
    [480, 324],
    [828, 559],
    [1242, 839],
    [1656, 1119],
  ].map(([w = 0, h = 0]) => ({ url: `${STOCK}/${String(w)}.webp`, w, h })),
  videos: [],
  credit: 'Photo: Pragyan Bezbaruah · Pexels',
  attribution_required: false,
  author: 'Pragyan Bezbaruah',
  source: 'pexels',
  source_url: 'https://www.pexels.com/photo/da-nang-city-name-at-beach-26550067/',
  licence: 'pexels',
  licence_url: 'https://www.pexels.com/license/',
};
