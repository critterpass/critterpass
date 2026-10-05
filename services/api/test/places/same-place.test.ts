import { describe, expect, it } from 'vitest';

import { onePerPlace, sameSearchPlace } from '../../src/places/same-place';

const at = (name: string, category: string, lat: number, lng: number) => ({
  name,
  category,
  lat,
  lng,
});

describe('one row per place in a search answer', () => {
  const pick = at('Biệt Thự Hằng Nga - Crazy House Đà Lạt', 'other', 11.9347, 108.4307);
  const hotel = at('The Crazy House', 'stay', 11.9348, 108.4308);
  const museum = at('Hang Nga Crazy House', 'museum', 11.9346, 108.4306);

  it('answers a villa, its hotel listing and its museum listing as the first of them', () => {
    expect(onePerPlace([pick, hotel, museum], 'Đà Lạt')).toEqual([pick]);
  });

  it('keeps the first row whatever its kind when the names only overlap', () => {
    expect(onePerPlace([hotel, museum], 'Đà Lạt')).toEqual([hotel]);
  });

  it('lets a sight of the same name take its hotel listing’s position', () => {
    const sight = at('Crazy House', 'museum', 11.9347, 108.4307);
    const cafe = at('Windmills Cafe', 'food', 11.94, 108.44);
    expect(onePerPlace([hotel, cafe, sight], 'Đà Lạt')).toEqual([sight, cafe]);
  });

  it('keeps two places of one name that lie far apart', () => {
    const temple = at('Pura Dalem Ubud', 'temple_shrine', -8.5035, 115.2587);
    const far = at('Pura Dalem Ubud', 'museum', -8.56, 115.28);
    expect(onePerPlace([temple, far], 'Bali')).toEqual([temple, far]);
  });

  it('merges one name across kinds within a few hundred metres', () => {
    const temple = at('Tanah Lot', 'temple_shrine', -8.6212, 115.0868);
    const other = at('Tanah Lot', 'other', -8.6205, 115.0875);
    expect(sameSearchPlace(temple, other, 'Bali')).toBe(true);
  });

  it('does not merge on one shared word or on a name the destination alone makes', () => {
    const warung = at('Warung', 'food', -8.5, 115.26);
    const made = at('Warung Made', 'food', -8.5, 115.26);
    expect(sameSearchPlace(warung, made, 'Bali')).toBe(false);
    expect(sameSearchPlace(at('Bali', 'other', 0, 0), at('Bali', 'other', 0, 0), 'Bali')).toBe(
      false,
    );
  });

  it('keeps a business named after the place beside it', () => {
    const river = at('Kamo River', 'nature', 35.0, 135.76);
    const guesthouse = at('Kamo River Guesthouse', 'stay', 35.0, 135.76);
    const cafe = at('Crazy House Coffee', 'food', 11.9347, 108.4307);
    expect(onePerPlace([river, guesthouse], 'Kyoto')).toEqual([river, guesthouse]);
    expect(onePerPlace([pick, cafe], 'Đà Lạt')).toEqual([pick, cafe]);
  });

  it('merges a mountain pinned in three spots under three names', () => {
    const batur = at('Mount Batur', 'nature', -8.242, 115.375);
    const long = at('Mount Batur, Bali, Indonesia', 'nature', -8.239, 115.377);
    const volcano = at('Mount Batur Volcano', 'nature', -8.245, 115.372);
    expect(onePerPlace([batur, long, volcano], 'Bali')).toEqual([batur]);
  });

  it('drops an unrecommended row that only repeats a recommended place’s name, however far', () => {
    const temple = {
      ...at('Tanah Lot Temple', 'temple_shrine', -8.6212, 115.0868),
      recommended: true,
    };
    const beach = { ...at('Tanah Lot', 'beach', -8.2, 115.6), recommended: false };
    const pin = { ...at('Tanah Lot', 'other', -8.6, 115.1), recommended: false };
    const terrace = {
      ...at('Tanah Lot Sunset Terrace', 'food', -8.62, 115.087),
      recommended: false,
    };
    expect(onePerPlace([temple, beach, pin, terrace], 'Bali')).toEqual([temple, terrace]);
    // Two recommended places of one name far apart are both kept.
    const far = { ...at('Tanah Lot Temple', 'museum', -8.3, 115.5), recommended: true };
    expect(onePerPlace([temple, far], 'Bali')).toEqual([temple, far]);
  });

  it('keeps neighbours with different names', () => {
    const a = at('Tanah Lot Sunset Terrace', 'food', -8.6212, 115.0868);
    const b = at('Tanah Lot Art Market', 'market', -8.6213, 115.0869);
    expect(onePerPlace([a, b], 'Bali')).toEqual([a, b]);
  });
});
