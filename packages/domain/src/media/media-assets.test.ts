import { describe, expect, it } from 'vitest';

import { mediaCandidateSchema, mediaListResponseSchema, STOCK_MEDIA_SOURCES } from './media-assets';

const asset = {
  id: '01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4b',
  kind: 'photo',
  subjects: ['poi:01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4c'],
  rank: 0,
  width: 2048,
  height: 1152,
  duration_ms: null,
  colour: '#1d6fa5',
  blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  images: [{ url: 'https://media.critterpass.app/c/media/a/640.webp', w: 640, h: 360 }],
  videos: [],
  credit: 'kaartcam · CC BY-SA 4.0 · Mapillary',
  attribution_required: true,
  author: 'kaartcam',
  source: 'mapillary',
  source_url: 'https://www.mapillary.com/app/?pKey=137035265111155',
  licence: 'cc-by-sa-4.0',
  licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

describe('media sources', () => {
  it('proposes a Mapillary photo under its own source and id', () => {
    const candidate = {
      id: 'mapillary-photo-137035265111155',
      kind: 'photo',
      source: 'mapillary',
      source_id: '137035265111155',
      source_url: asset.source_url,
      download_url: 'https://scontent.example.fbcdn.net/a.jpg',
      preview_url: 'https://scontent.example.fbcdn.net/a.jpg',
      subjects: ['poi:fsq-os-4d5cfd269895b1f725f8ea0f'],
      rank: 0,
      title: null,
      author: 'kaartcam',
      author_url: null,
      licence: 'cc-by-sa-4.0',
      licence_url: asset.licence_url,
      attribution_required: true,
      credit: asset.credit,
      width: 2048,
      height: 1152,
      duration_ms: null,
    };
    expect(mediaCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(mediaCandidateSchema.safeParse({ ...candidate, source: 'flickr' }).success).toBe(false);
    expect(STOCK_MEDIA_SOURCES).not.toContain('mapillary');
  });

  it('reads a list that holds a source added after the reader shipped', () => {
    const list = { items: [asset, { ...asset, source: 'a-later-source' }] };
    const parsed = mediaListResponseSchema.safeParse(list);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.items.map((item) => [item.source, item.credit])).toEqual([
      ['mapillary', asset.credit],
      ['a-later-source', asset.credit],
    ]);
  });
});
