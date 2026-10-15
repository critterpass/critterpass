import { describe, expect, it } from 'vitest';

import { destinationKind, type ClassedItem } from '../../src/destinations/base/classes';
import { destinationsFromItems, type WikivoyageItem } from '../../src/destinations/base/wikidata';

// Class → the roots it reaches through wdt:P279*, as WDQS answered for these classes.
const SETTLEMENT = 'Q486972';
const CITY = 'Q515';
const TOWN = 'Q3957';
const MUNICIPALITY = 'Q15284';
const rootsOf = new Map<string, Set<string>>(
  Object.entries({
    Q70208: ['Q70208'], // municipality of Switzerland
    Q1187811: [CITY, SETTLEMENT, 'Q123705'], // college town (filed under neighbourhood)
    Q51929311: [CITY, SETTLEMENT], // largest city
    Q2074737: [MUNICIPALITY], // municipality of Spain
    Q13217644: [MUNICIPALITY], // municipality of Portugal
    Q1059478: [TOWN, MUNICIPALITY, SETTLEMENT], // town of Japan
    Q1200957: ['Q1200957'], // tourist destination
    Q6256: ['Q6256'], // country
    Q133442: [CITY, SETTLEMENT], // city-state
    Q12443800: ['Q10864048', 'Q6256'], // state of India
    Q1637706: [CITY, SETTLEMENT], // megacity
    Q183113: [SETTLEMENT], // human settlement (Bora Bora)
    Q1402592: ['Q1402592'], // island group
    Q134999516: [], // special zone of Vietnam
    Q122395435: ['Q46169', 'Q473972'], // national park of Vietnam
    Q2582669: [], // district
    Q2389082: [], // commune of Vietnam
    Q687188: [], // ward of Vietnam
    Q1289426: [], // county of China
    Q839954: ['Q839954'], // archaeological site
    Q15661340: [CITY, SETTLEMENT, 'Q839954'], // ancient city
    Q23397: ['Q23397'], // lake
    Q6644510: ['Q6644510'], // urban district
    Q4286337: ['Q4286337'], // city district
    Q644371: ['Q1248784'], // international airport
    Q82794: [], // region
    Q46831: [], // mountain range
    Q23442: ['Q23442'], // island
    Q532: ['Q532', SETTLEMENT], // village
    Q486972: [SETTLEMENT], // human settlement
    Q2824648: ['Q10864048'], // province of Vietnam
    Q34918903: ['Q46169', 'Q473972'], // National Park of the United States
    Q17343829: [SETTLEMENT], // unincorporated community
    Q20928: [CITY, SETTLEMENT, 'Q10864048'], // metropolitan city of South Korea
  }).map(([cls, roots]) => [cls, new Set(roots)]),
);

const kind = (classes: string[], overrides: Partial<ClassedItem> = {}) =>
  destinationKind({ classes, titles: [], labels: [], population: null, ...overrides }, rootsOf);

describe('destination classes', () => {
  it('takes cities and towns whatever local class Wikidata files them under', () => {
    // Zurich: municipality of Switzerland, college town, largest city.
    expect(kind(['Q70208', 'Q1187811', 'Q51929311'], { population: 421_878 })).toBe('city');
    expect(kind(['Q2074737'], { population: 807_693 })).toBe('city'); // Valencia
    expect(kind(['Q13217644'], { population: 26_193 })).toBe('town'); // Sintra
    expect(kind(['Q1059478', 'Q1200957'], { population: 11_000 })).toBe('town'); // Hakone
    expect(kind(['Q1637706'], { population: 32_000_000 })).toBe('city'); // Chongqing
    expect(kind(['Q532'], { population: 900 })).toBe('village');
  });

  it('keeps a city-state and drops a country or a state', () => {
    expect(kind(['Q6256', 'Q133442'], { population: 38_000 })).toBe('city'); // Monaco
    expect(kind(['Q12443800'], { population: 1_458_545 })).toBeNull(); // Goa
    expect(kind(['Q20928'], { population: 3_000_000 })).toBe('city'); // Incheon
    expect(kind(['Q2824648', 'Q486972'], { population: 1_700_000 })).toBeNull(); // Kiên Giang
  });

  it('takes islands, parks and sights', () => {
    expect(kind(['Q183113', 'Q1402592'], { population: 10_000 })).toBe('island'); // Bora Bora
    expect(kind(['Q1402592', 'Q134999516'])).toBe('island'); // Côn Đảo
    expect(kind(['Q23442'], { population: 949_047 })).toBe('island'); // Mallorca
    expect(kind(['Q23442'], { population: 104_000_000 })).toBeNull(); // Honshu
    expect(kind(['Q6256', 'Q23442'], { population: 1_500_000 })).toBeNull(); // Bahrain, a country
    expect(kind(['Q122395435'])).toBe('park'); // Phong Nha–Kẻ Bàng
    expect(kind(['Q34918903', 'Q17343829'])).toBe('park'); // Yosemite, also a community
    expect(kind(['Q839954', 'Q15661340'])).toBe('park'); // Machu Picchu, an ancient city
    expect(kind(['Q23397'])).toBe('park'); // Inle Lake
    expect(kind(['Q1200957'])).toBe('park'); // Cinque Terre
  });

  it('takes the rural districts, communes and counties Wikivoyage covers as towns', () => {
    expect(kind(['Q2582669'])).toBe('town'); // Bắc Hà
    expect(kind(['Q2389082'])).toBe('town'); // Tam Đảo
    expect(kind(['Q687188'])).toBe('town'); // Mũi Né
    expect(kind(['Q1289426'], { population: 310_000 })).toBe('city'); // Yangshuo county
  });

  it('drops city parts, airports, regions and ranges', () => {
    expect(kind(['Q6644510'], { population: 140_000 })).toBeNull(); // District 1
    expect(kind(['Q4286337'], { population: 266_477 })).toBeNull(); // Eixample
    expect(kind(['Q644371'])).toBeNull();
    expect(kind(['Q644371', 'Q486972'])).toBeNull(); // Schiphol, also filed as a settlement
    expect(kind(['Q82794'])).toBeNull();
    expect(kind(['Q46831'])).toBeNull();
    expect(kind([])).toBeNull();
  });

  it('drops a Wikivoyage district subpage, but not a city named with a slash', () => {
    expect(kind(['Q2074737'], { titles: ['Barcelona/Gràcia'], labels: ['Gràcia'] })).toBeNull();
    expect(kind(['Q70208'], { titles: ['Biel/Bienne'], labels: ['Biel/Bienne'] })).toBe('town');
  });
});

describe('destinationsFromItems', () => {
  const item = (overrides: Partial<WikivoyageItem>): WikivoyageItem => ({
    qid: 'Q1',
    geonamesId: null,
    name: 'Place',
    names: { en: 'Place' },
    countryCode: 'FR',
    admin1: null,
    lat: 0,
    lng: 0,
    population: null,
    sitelinks: 20,
    photoFile: null,
    classes: ['Q532'],
    titles: ['Place'],
    ...overrides,
  });

  it('needs 10 sitelinks, 5 in Vietnam, and carries the Wikivoyage edition count', () => {
    const rows = destinationsFromItems(
      [
        item({ qid: 'Q1', sitelinks: 9 }),
        item({ qid: 'Q2', sitelinks: 6, countryCode: 'VN', classes: ['Q2582669'] }),
        item({ qid: 'Q3', sitelinks: 4, countryCode: 'VN' }),
        item({ qid: 'Q4', sitelinks: 80, classes: ['Q644371'] }),
        item({ qid: 'Q5', sitelinks: 80 }),
      ],
      rootsOf,
      new Map([['Q5', 7]]),
    );
    expect(rows.map((row) => [row.qid, row.kind, row.wikivoyage])).toEqual([
      ['Q2', 'town', 1],
      ['Q5', 'village', 7],
    ]);
  });
});
