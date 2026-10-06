/**
 * A destination with no curated media (Hà Nội): its picks and its browse carry each place's AI
 * profile photo, and the app shows it wherever the place has no asset of its own: on the pick
 * cards, the list rows and the map cards, and as the hero's cover with the place and the site it
 * came from. The bodies are the api's answers for Hà Nội as recorded from staging.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { PlaceMediaAsset } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import type { PlaceTilePhoto } from '@/data/media/use-place-tile-photos';

import { exploreDestinationReadSchema } from '../data/use-explore-destination';
import { browsePhotos, browseSchema } from '../map-queries';
import { isGenericPhoto } from '../place-photo';
import { coverMedia, pickPhoto, withProfileTiles } from '../profile-photo';

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as unknown;

const LAKE = '01a10bbd-57a2-79e8-a27a-65474a5e1716';
const TEMPLE = '01a10bb7-5851-76be-a070-91d243e625c9';
const WEST_LAKE = '01a10bb7-586e-704f-97c8-6b838fd18ebf';
const LAKE_PHOTO = `https://media.staging.critterpass.app/c/place-profiles/${LAKE}/1.jpg`;

function destination(body: unknown = fixture('explore-destination-ha-noi.json')) {
  const parsed = exploreDestinationReadSchema.safeParse(body);
  if (!parsed.success) throw new Error('the recorded answer no longer parses');
  return parsed.data;
}

function browse() {
  const parsed = browseSchema.safeParse(fixture('places-browse-ha-noi.json'));
  if (!parsed.success) throw new Error('the recorded browse no longer parses');
  return parsed.data.results;
}

describe("the guide's read", () => {
  it("keeps each pick's photo by place, and none for a pick without one", () => {
    const data = destination();
    expect(data.picks).toHaveLength(4);
    expect(Object.keys(data.pick_photos)).toHaveLength(3);
    expect(data.pick_photos[LAKE]).toEqual({
      url: LAKE_PHOTO,
      source_page: 'https://commons.wikimedia.org/wiki/File:Ho_hoan_kiem_toa_nha_vnpt.jpg',
    });
  });

  it('reads its saved copy the same, so the photos draw offline', () => {
    const first = destination();
    // The last good copy is the parsed answer: the picks no longer hold their photos.
    const saved = JSON.parse(JSON.stringify(first)) as unknown;
    expect(destination(saved)).toEqual(first);
  });

  it('reads an answer from before the photos as one without any', () => {
    const body = fixture('explore-destination-ha-noi.json') as {
      cover?: unknown;
      picks: { item: { photo?: unknown } }[];
    };
    delete body.cover;
    for (const pick of body.picks) delete pick.item.photo;
    const data = destination(body);
    expect(data.cover).toBeNull();
    expect(data.pick_photos).toEqual({});
    expect(data.picks).toHaveLength(4);
  });

  it('drops a photo that is not an https address', () => {
    const body = fixture('explore-destination-ha-noi.json') as {
      cover: { url: string };
      picks: { item: { photo: { url: string } | null } }[];
    };
    body.cover.url = 'file:///etc/hosts';
    if (body.picks[0]?.item.photo) body.picks[0].item.photo.url = 'javascript:alert(1)';
    const data = destination(body);
    expect(data.cover).toBeNull();
    expect(data.pick_photos[LAKE]).toBeUndefined();
  });
});

describe('the cover of a destination without curated media', () => {
  it("is the first pick's photo, credited with the place and the site it came from", () => {
    const cover = coverMedia(destination().cover);
    expect(cover?.images[0]?.url).toBe(LAKE_PHOTO);
    expect(cover?.attribution_required).toBe(true);
    expect(cover?.credit).toBe('Hoan Kiem Lake · commons.wikimedia.org');
  });

  it('is nothing when no pick has a photo, so the hero keeps its colour', () => {
    expect(coverMedia(null)).toBeNull();
    expect(coverMedia(undefined)).toBeNull();
  });
});

describe("a pick's picture", () => {
  const asset = { id: 'a', source: 'wikimedia' } as PlaceMediaAsset;

  it("is the place's own asset where the media read has one", () => {
    expect(pickPhoto(LAKE, asset, destination().pick_photos[LAKE])).toBe(asset);
  });

  it('is its profile photo otherwise: the place itself, with no line on the picture', () => {
    const photo = pickPhoto(LAKE, undefined, destination().pick_photos[LAKE]);
    expect(photo?.images[0]?.url).toBe(LAKE_PHOTO);
    expect(photo?.attribution_required).toBe(false);
    expect(isGenericPhoto(photo)).toBe(false);
  });

  it('is nothing with neither', () => {
    expect(pickPhoto(WEST_LAKE, undefined, destination().pick_photos[WEST_LAKE])).toBeNull();
  });
});

describe('the rows of the places list and the cards of the map', () => {
  it('reads the profile photos the browse carries, by place', () => {
    const photos = browsePhotos(browse());
    expect([...photos.keys()]).toEqual([LAKE, TEMPLE]);
    expect(photos.get(LAKE)?.url).toBe(LAKE_PHOTO);
  });

  it("shows a place's own asset first, its profile photo otherwise", () => {
    const own: PlaceTilePhoto = {
      tile: {
        photo: { uri: 'https://fastly.4sqi.net/img/general/320x320/lake.jpg' },
        genericPhoto: false,
      },
      credit: 'Powered by Foursquare',
      creditRequired: true,
      creditOnScreen: true,
      link: null,
    };
    const tiles = withProfileTiles(new Map([[LAKE, own]]), browsePhotos(browse()));
    expect(tiles.get(LAKE)).toBe(own);
    expect(tiles.get(TEMPLE)).toEqual({
      tile: {
        photo: {
          uri: `https://media.staging.critterpass.app/c/place-profiles/${TEMPLE}/1.jpg`,
        },
        genericPhoto: false,
      },
      credit: '',
      creditRequired: false,
      creditOnScreen: false,
      link: null,
    });
    expect(tiles.has(WEST_LAKE)).toBe(false);
  });
});
