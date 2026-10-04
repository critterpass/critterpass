import { describe, expect, it } from 'vitest';

import { buildRelease, loadRelease, mediaItemSchema, poiRefOfSubject, poiRefSubject } from '../src';

const photo = {
  id: 'pexels-photo-2161467',
  kind: 'photo',
  source: 'pexels',
  source_id: '2161467',
  source_url: 'https://www.pexels.com/photo/dragon-bridge-2161467/',
  download_url: 'https://images.pexels.com/photos/2161467/pexels-photo-2161467.jpeg',
  preview_url: 'https://images.pexels.com/photos/2161467/pexels-photo-2161467.jpeg?w=640',
  subjects: ['destination:da-nang'],
  rank: 0,
  title: 'Dragon Bridge at night',
  author: 'Someone',
  author_url: 'https://www.pexels.com/@someone',
  licence: 'pexels',
  licence_url: 'https://www.pexels.com/license/',
  attribution_required: false,
  credit: 'Photo: Someone · Pexels',
  width: 6000,
  height: 4000,
  duration_ms: null,
} as const;

describe('media items', () => {
  it('accepts a licensed photo and round-trips it through a release', () => {
    const release = buildRelease({
      kind: 'media',
      version: 1,
      items: [mediaItemSchema.parse(photo)],
      generated_by: {
        batch_key: '2026-10-01-media-01',
        route: null,
        model: null,
        generated_at: '2026-10-01T00:00:00Z',
      },
      approved_by: null,
    });
    expect(loadRelease(release, 'media').items[0]?.credit).toBe('Photo: Someone · Pexels');
  });

  it('keys the item by source, kind and source id', () => {
    expect(mediaItemSchema.safeParse({ ...photo, id: 'pexels-photo-1' }).success).toBe(false);
  });

  it('gives a video a duration and a photo none', () => {
    expect(mediaItemSchema.safeParse({ ...photo, duration_ms: 8000 }).success).toBe(false);
    expect(
      mediaItemSchema.safeParse({ ...photo, id: 'pexels-video-2161467', kind: 'video' }).success,
    ).toBe(false);
  });

  it('refuses a free-text subject', () => {
    expect(mediaItemSchema.safeParse({ ...photo, subjects: ['Da Nang'] }).success).toBe(false);
  });
});

describe("a place photo's subject", () => {
  it('names the place by its source ref, for every source a curated place comes from', () => {
    expect(poiRefSubject('fsq_os:4D5CFD269895B1F725F8EA0F')).toBe(
      'poi:fsq-os-4d5cfd269895b1f725f8ea0f',
    );
    expect(poiRefSubject('overture:6eb596b4-7e24-458a-8b4f-c9514d9a7889')).toBe(
      'poi:overture-6eb596b4-7e24-458a-8b4f-c9514d9a7889',
    );
    // A place made from a Wikidata item (a landmark beyond the importer's area).
    expect(poiRefSubject('editorial:wikidata-Q391406')).toBe('poi:editorial-wikidata-q391406');
    expect(poiRefOfSubject('poi:editorial-wikidata-q391406')).toEqual({
      source: 'editorial',
      id: 'wikidata-q391406',
    });
    expect(poiRefOfSubject('poi:fsq-os-4d5cfd269895b1f725f8ea0f')).toEqual({
      source: 'fsq_os',
      id: '4d5cfd269895b1f725f8ea0f',
    });
  });

  it('refuses a ref it cannot name, and reads no ref from other subjects', () => {
    expect(() => poiRefSubject('osm:node/1')).toThrow();
    expect(() => poiRefSubject('unknown:abc')).toThrow();
    expect(poiRefOfSubject('poi:01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4b')).toBeNull();
    expect(poiRefOfSubject('destination:da-nang')).toBeNull();
  });
});
