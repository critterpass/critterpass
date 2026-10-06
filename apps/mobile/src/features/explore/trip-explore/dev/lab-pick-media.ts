/**
 * Place photos for the lab's Explore-in-a-trip picks, as `GET /v1/media` returns them: each pick's
 * own Commons photo (CC BY, so its credit shows), served from Commons' thumbnail host. The picks
 * are landmarks and nature, which never get a generic stock photo, so none of them carries one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { MediaAsset } from '@cp/domain';

import { BEACH_GENERIC } from '../../dev/lab-place-media';

const THUMBS = 'https://thumb.wikimedia.org/wikipedia/commons/thumb';
const BY_4 = {
  name: 'CC BY 4.0',
  id: 'cc-by-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0',
};
const BY_2 = {
  name: 'CC BY 2.0',
  id: 'cc-by-2.0',
  url: 'https://creativecommons.org/licenses/by/2.0',
};

function commons(input: {
  readonly n: number;
  readonly poi: string;
  readonly path: string;
  readonly file: string;
  readonly author: string;
  readonly width: number;
  readonly height: number;
  readonly licence?: typeof BY_4;
}): MediaAsset {
  const licence = input.licence ?? BY_4;
  return {
    id: `01a0f4a2-0000-7000-8000-00000000b${String(input.n).padStart(3, '0')}`,
    kind: 'photo',
    subjects: [`poi:${input.poi}`],
    rank: 0,
    width: input.width,
    height: input.height,
    duration_ms: null,
    colour: null,
    blurhash: BEACH_GENERIC.blurhash,
    images: [960, 1920].map((w) => ({
      url: `${THUMBS}/${input.path}/${input.file}/${String(w)}px-${input.file}`,
      w,
      h: Math.round((w * input.height) / input.width),
    })),
    videos: [],
    credit: `${input.author} · ${licence.name} · Wikimedia Commons`,
    attribution_required: true,
    author: input.author,
    source: 'wikimedia',
    source_url: `https://commons.wikimedia.org/wiki/File:${input.file}`,
    licence: licence.id,
    licence_url: licence.url,
  };
}

export const LAB_PICK_MEDIA: Readonly<Record<string, MediaAsset>> = {
  'tirta-empul': commons({
    n: 1,
    poi: 'tirta-empul',
    path: 'c/c6',
    file: 'Bali_-_Pura_Tirta_Empul_%282025%29_-_img_23.jpg',
    author: 'Chainwit.',
    width: 5712,
    height: 4284,
  }),
  campuhan: commons({
    n: 3,
    poi: 'campuhan',
    path: '3/35',
    file: 'Campuhan_Ridge_Walk%2C_Ubud%2C_Bali_%2815003625958%29.jpg',
    author: 'Fabio Achilli',
    width: 4608,
    height: 3456,
    licence: BY_2,
  }),
  tegallalang: commons({
    n: 2,
    poi: 'tegallalang',
    path: '3/3a',
    file: 'Tegallalang_Rice_Terraces_Bali.jpg',
    author: 'Philip Nalangan',
    width: 6016,
    height: 4000,
  }),
};
