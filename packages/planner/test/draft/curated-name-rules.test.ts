/**
 * The curated name rules on places the loader missed: a row written in the place's Latin local
 * name, the full name with the destination's or joining words aside, or the same words in
 * another order is the place within the same-name radius; a bare generic word, a lookalike and
 * a clearly different name stay turned down. Names and distances are from a staging load.
 */
import type { NominatimResult } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  acceptResult,
  chooseCuratedMatch,
  plainWords,
  type CuratedLead,
  type MatchCandidate,
} from '../../src/draft';

function lead(name: string, localName: string | null, category = 'other'): CuratedLead {
  return { name, localName, category: category as CuratedLead['category'], lat: 0, lng: 0 };
}

function row(name: string, distanceM: number, category = 'other'): MatchCandidate {
  return {
    id: name,
    name,
    nameLocal: null,
    category,
    lat: 0,
    lng: 0,
    address: null,
    quality: 1,
    distanceM,
    similarity: 0.3,
  };
}

const matched = (place: CuratedLead, candidate: MatchCandidate, plain: ReadonlySet<string>) =>
  chooseCuratedMatch(place, [candidate], plain).kind === 'match';

describe('matching a curated place by its full name', () => {
  it('takes a row written in the place’s Latin local name', () => {
    const caMau = plainWords('Cà Mau', 'Vietnam');
    expect(
      matched(
        lead('Ca Mau Night Market', 'Chợ đêm Cà Mau', 'market'),
        row('Chợ đêm cà mau', 593, 'market'),
        caMau,
      ),
    ).toBe(true);
    expect(
      matched(
        lead('House of Leaves', 'Shtëpia e Gjetheve', 'museum'),
        row('Shtepia E Gjetheve', 508, 'museum'),
        plainWords('Tirana', 'Albania'),
      ),
    ).toBe(true);
    expect(
      matched(
        lead('Notre-Dame Basilica of Montreal', 'Basilique Notre-Dame de Montréal'),
        row('Basilique Notre-Dame de Montréal', 24, 'temple_shrine'),
        plainWords('Montreal', 'Canada'),
      ),
    ).toBe(true);
  });

  it('reads the full name with the destination’s words and joining words aside', () => {
    const argentina = (city: string) => plainWords(city, 'Argentina');
    expect(
      matched(
        lead('Mercado Central', null, 'market'),
        row('Mercado Central De Mendoza', 354, 'market'),
        argentina('Mendoza'),
      ),
    ).toBe(true);
    expect(
      matched(
        lead('El Mercado', 'El Mercado', 'food'),
        row('El Mercado Ushuaia', 789, 'food'),
        argentina('Ushuaia'),
      ),
    ).toBe(true);
    expect(
      matched(
        lead('Restaurant Orsan', null, 'food'),
        row('Orsan Restaurant', 516, 'food'),
        plainWords('Dubrovnik', 'Croatia'),
      ),
    ).toBe(true);
  });

  it('reads each name a name carries, but never a branch’s area', () => {
    expect(
      matched(
        lead('Ghositaram Pagoda', 'Chùa Ghositaram (Chùa Cù Lao)', 'temple_shrine'),
        row('Chùa Ghositaram', 991, 'temple_shrine'),
        plainWords('Bạc Liêu', 'Vietnam'),
      ),
    ).toBe(true);
    expect(
      matched(
        lead('Cat Ba National Park', 'Vườn quốc gia Cát Bà', 'nature'),
        row('Vườn Quốc gia Cát Bà / Cat Ba National Park', 886, 'nature'),
        plainWords('Cát Bà', 'Vietnam'),
      ),
    ).toBe(true);
    expect(
      matched(
        lead('Myeongdong', '명동', 'shopping'),
        row('MNG (Myeongdong)', 600, 'shopping'),
        plainWords('Seoul', 'South Korea'),
      ),
    ).toBe(false);
  });

  it('takes a one-word full name within a short walk only', () => {
    const innsbruck = plainWords('Innsbruck', 'Austria');
    const hofgarten = lead('Hofgarten Innsbruck', 'Hofgarten Innsbruck', 'nature');
    expect(matched(hofgarten, row('Hofgarten', 257, 'nature'), innsbruck)).toBe(true);
    expect(matched(hofgarten, row('Hofgarten', 900, 'nature'), innsbruck)).toBe(false);
  });

  it('never takes a bare generic word, a lookalike or a clearly different name', () => {
    const yerevan = plainWords('Yerevan', 'Armenia');
    const library = lead('Mirzoyan Library', null, 'other');
    expect(matched(library, row('Library', 120), yerevan)).toBe(false);
    expect(matched(library, row('Library', 900), yerevan)).toBe(false);
    expect(
      matched(
        lead('Times Square', null),
        row('Time Square Square', 889, 'museum'),
        plainWords('New York', 'United States'),
      ),
    ).toBe(false);
    expect(
      matched(
        lead('Ca Mau Night Market', 'Chợ đêm Cà Mau', 'market'),
        row('Chợ Phường 2', 300, 'market'),
        plainWords('Cà Mau', 'Vietnam'),
      ),
    ).toBe(false);
    expect(
      matched(
        lead('Cao Bang Central Market', 'Chợ Cao Bằng', 'market'),
        { ...row('Cafe 88 Cao BẰNg', 75, 'food'), similarity: 0.6 },
        plainWords('Cao Bằng', 'Vietnam'),
      ),
    ).toBe(false);
  });
});

describe('accepting an OpenStreetMap answer named only in the local language', () => {
  it('takes it when the name is the place’s local name', () => {
    const result = {
      place_id: 1,
      licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
      osm_type: 'node',
      osm_id: 11,
      lat: '9.1769',
      lon: '105.1524',
      category: 'amenity',
      type: 'marketplace',
      place_rank: 30,
      importance: 1e-5,
      addresstype: 'amenity',
      name: 'Chợ đêm Cà Mau',
      display_name: 'Chợ đêm Cà Mau, Cà Mau, Việt Nam',
      address: { city: 'Cà Mau', country: 'Việt Nam', country_code: 'vn' },
      extratags: {},
      namedetails: { name: 'Chợ đêm Cà Mau' },
      boundingbox: ['9.1768', '9.1770', '105.1523', '105.1525'],
    } as NominatimResult;
    const place = { ...lead('Ca Mau Night Market', 'Chợ đêm Cà Mau', 'market'), lat: 9.18 };
    const found = acceptResult(
      { ...place, lng: 105.15 },
      result,
      plainWords('Cà Mau', 'Vietnam'),
      2_000,
    );
    expect(found?.place.sourceId).toBe('n11');
  });
});
