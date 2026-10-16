/**
 * A curated place is never a business of another kind named after it: a quay or a street is not
 * the ramen shop, the hotel or the restaurant that carries its name, a sight is not the trattoria
 * named after it, and among same-name rows the one of a fitting kind wins. A business the
 * researcher says the place is (a palace hotel, a bar filed as a restaurant) still matches, and a
 * typed search with no researched kind keeps its matches.
 */
import { describe, expect, it } from 'vitest';

import {
  chooseCuratedMatch,
  type CuratedLead,
  type MatchCandidate,
} from '../../../src/places/curated-load/match';
import { plainWords } from '../../../src/places/pick/match';

function place(name: string, category: string, subtype: string | null): CuratedLead {
  return {
    name,
    localName: null,
    category: category as CuratedLead['category'],
    subtype,
    lat: 0,
    lng: 0,
  };
}

function row(id: string, name: string, category: string, distanceM = 60): MatchCandidate {
  return {
    id,
    name,
    nameLocal: null,
    category,
    lat: 0,
    lng: 0,
    address: null,
    quality: 1,
    distanceM,
    similarity: 0.4,
  };
}

const matchOf = (lead: CuratedLead, rows: MatchCandidate[], plain: ReadonlySet<string>) => {
  const verdict = chooseCuratedMatch(lead, rows, plain);
  return verdict.kind === 'match' ? verdict.row.id : null;
};

describe('matching a curated place to a row of its own kind', () => {
  const singapore = plainWords('Singapore', 'Singapore');
  const bangkok = plainWords('Bangkok', 'Thailand');

  it('never takes a shop, restaurant or hotel named after a quay', () => {
    const clarke = place('Clarke Quay', 'nightlife', 'riverside dining');
    expect(matchOf(clarke, [row('ippudo', 'IPPUDO CLARKE QUAY', 'food')], singapore)).toBeNull();
    const boat = place('Boat Quay', 'nightlife', 'riverside bar strip');
    expect(matchOf(boat, [row('byd', 'BYD Boat Quay 1826', 'food')], singapore)).toBeNull();
    // Even under exactly the quay's name, a hotel is not the strip.
    const robertson = place('Robertson Quay', 'nightlife', 'riverside dining strip');
    expect(matchOf(robertson, [row('flat', 'Robertson Quay', 'stay')], singapore)).toBeNull();
  });

  it('takes the street itself over a restaurant filed under its name', () => {
    const khaoSan = place('Khao San Road', 'nightlife', 'backpacker street');
    const rows = [
      row('venue', 'Khao San Road', 'food', 40),
      row('street', 'Khao San Road', 'other'),
    ];
    expect(matchOf(khaoSan, rows, bangkok)).toBe('street');
    expect(matchOf(khaoSan, [rows[0]!], bangkok)).toBeNull();
  });

  it('reads an area from the researched kind when the name does not say it', () => {
    const district = place('Northbridge', 'nightlife', 'dining and nightlife district');
    const perth = plainWords('Perth', 'Australia');
    expect(matchOf(district, [row('nandos', "Nando's Northbridge", 'food')], perth)).toBeNull();
    // A restaurant whose name ends in "Street" is a restaurant, not a street.
    const thai = place('Bangkok Street', 'food', 'Thai late-night restaurant');
    const vegas = plainWords('Las Vegas', 'United States');
    expect(matchOf(thai, [row('thai', 'Bangkok Street', 'food')], vegas)).toBe('thai');
  });

  it('never takes a business of another kind named after a sight', () => {
    const florence = plainWords('Florence', 'Italy');
    const bridge = place('Ponte Vecchio', 'other', 'medieval bridge');
    expect(matchOf(bridge, [row('t', 'Trattoria Ponte Vecchio', 'food')], florence)).toBeNull();
    const cartagena = plainWords('Cartagena', 'Colombia');
    const tower = place('Torre del Reloj', 'other', 'landmark gate');
    expect(matchOf(tower, [row('h', 'Hotel Torre Del Reloj', 'stay')], cartagena)).toBeNull();
  });

  it('keeps a business the researched kind says the place is, and a bar filed as food', () => {
    const abuDhabi = plainWords('Abu Dhabi', 'United Arab Emirates');
    const palace = place('Emirates Palace', 'other', 'palace hotel');
    // Nearly the same text close by (the name rules' trigram match).
    const hotel = { ...row('hotel', 'Hotel Emirates Palace', 'stay'), similarity: 0.6 };
    expect(matchOf(palace, [hotel], abuDhabi)).toBe('hotel');
    const mendoza = plainWords('Mendoza', 'Argentina');
    const bar = place('La Central Vermutería', 'nightlife', 'vermouth bar');
    const filed = row('bar', 'La Central Vermutería Mendoza', 'food');
    expect(matchOf(bar, [filed], mendoza)).toBe('bar');
  });

  it('prefers the same-name row of a fitting kind', () => {
    const split = plainWords('Split', 'Croatia');
    const palace = place("Diocletian's Palace", 'other', 'palace');
    const rows = [
      row('hotel', "Diocletian's Palace", 'stay', 30),
      row('sight', "Diocletian's Palace", 'other', 90),
    ];
    expect(matchOf(palace, rows, split)).toBe('sight');
    // A row of a clashing kind under exactly the name is still the place when it is the only one.
    expect(matchOf(palace, [rows[0]!], split)).toBe('hotel');
  });

  it('leaves a typed search without a researched kind to the name rules', () => {
    const florence = plainWords('Florence', 'Italy');
    const typed: CuratedLead = {
      name: 'Ponte Vecchio',
      localName: null,
      category: 'other',
      lat: 0,
      lng: 0,
    };
    const trattoria = row('trattoria', 'Trattoria Ponte Vecchio', 'food');
    expect(matchOf(typed, [trattoria], florence)).toBe('trattoria');
  });
});
