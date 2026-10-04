/**
 * The Bali places the search suites seed (see bali-fixture.ts): the villa's surroundings for 7d-2
 * and 7d-4, placed by kilometres from the villa so straight-line minutes are predictable.
 */
export const VILLA = { lat: -8.5069, lng: 115.2625 };
export const TRIP_DATES = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
];
const WEEK = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

/** Weekly hours, every day the same unless `days` says which. */
export const hours = (start: string, end: string, days = WEEK) =>
  JSON.stringify({ weekly: Object.fromEntries(days.map((d) => [d, [{ start, end }]])) });

/** A point `northKm` and `eastKm` from the villa. */
export const fromVilla = (northKm: number, eastKm: number) => ({
  lat: VILLA.lat + northKm / 111.2,
  lng: VILLA.lng + eastKm / (111.2 * Math.cos((VILLA.lat * Math.PI) / 180)),
});

export interface BaliPlace {
  readonly name: string;
  readonly category: string;
  readonly at: { lat: number; lng: number };
  readonly address: string;
  readonly hours?: string;
  readonly tags?: readonly string[];
  readonly curation?: 'editorial' | 'auto';
}

export const UBUD = 'Jl. Raya Sanggingan, Ubud, Gianyar Regency, Bali 80571';

/** 7d-2: six quiet dinners open past 22:00 within 15 minutes, and three that break one chip. */
export const QUIET_DINNERS: readonly BaliPlace[] = [
  ['Sayan House', 1.2, 0.6, '17:00', '23:00'],
  ['Bridges', 1.5, -0.8, '11:00', '23:00'],
  ["Murni's Warung", 2.0, 0.4, '08:00', '22:30'],
  ['Hujan Locale', 2.4, 1.0, '12:00', '23:00'],
  ['Mozaic', 1.0, 2.2, '18:00', '23:30'],
  ['Room4Dessert', 2.8, -0.4, '18:00', '23:59'],
].map(([name, north, east, start, end]) => ({
  name: name as string,
  category: 'food',
  at: fromVilla(north as number, east as number),
  address: UBUD,
  hours: hours(start as string, end as string),
  tags: ['quiet', 'view'],
  curation: 'editorial',
}));

export const LOUDER_OR_FURTHER: readonly BaliPlace[] = [
  {
    name: 'Laughing Buddha Bar',
    category: 'food',
    at: fromVilla(1.8, 1.4),
    address: UBUD,
    hours: hours('17:00', '23:30'),
    tags: ['live_music'],
  },
  {
    name: 'Bambu Indah Dining',
    category: 'food',
    at: fromVilla(-7.5, -3.0),
    address: 'Banjar Baung, Sayan, Ubud, Gianyar Regency',
    hours: hours('17:00', '23:00'),
    tags: ['quiet'],
  },
  {
    name: 'Wednesday Supper Club',
    category: 'food',
    at: fromVilla(1.1, -1.2),
    address: UBUD,
    hours: JSON.stringify({
      weekly: {
        ...Object.fromEntries(WEEK.map((d) => [d, [{ start: '17:00', end: '21:30' }]])),
        we: [{ start: '17:00', end: '23:30' }],
      },
    }),
    tags: ['quiet'],
  },
];

/** Neither: a breakfast cafe (no dinner) and a waterfall (not food). */
export const NOT_DINNER: readonly BaliPlace[] = [
  {
    name: 'Kafe Pagi',
    category: 'food',
    at: fromVilla(0.9, 0.9),
    address: UBUD,
    hours: hours('07:00', '15:00'),
    tags: ['quiet'],
  },
  {
    name: 'Tegenungan Waterfall',
    category: 'nature',
    at: fromVilla(-6.0, 1.0),
    address: 'Kemenuh, Sukawati, Gianyar Regency',
    hours: hours('07:00', '18:00'),
    tags: ['view'],
  },
];

/** 7d-4: omakase only an hour or more away; four Japanese places around Ubud, two open late. */
export const OMAKASE: readonly BaliPlace[] = [
  {
    name: 'Hiroshi Omakase',
    category: 'food',
    at: { lat: -8.68, lng: 115.165 },
    address: 'Jl. Kayu Aya No.5, Seminyak, Kuta Utara, Badung Regency',
    hours: hours('18:00', '23:00'),
    tags: ['japanese', 'sushi', 'omakase'],
  },
  {
    name: 'Kaze Omakase Counter',
    category: 'food',
    at: { lat: -8.685, lng: 115.16 },
    address: 'Jl. Petitenget No.12, Seminyak, Kuta Utara, Badung Regency',
    hours: hours('18:00', '22:00'),
    tags: ['japanese', 'sushi', 'omakase'],
  },
  {
    name: 'Sushi Omakase Batu Bolong',
    category: 'food',
    at: { lat: -8.654, lng: 115.12 },
    address: 'Jl. Pantai Batu Bolong No.40, Canggu, Kuta Utara, Badung Regency',
    hours: hours('12:00', '22:00'),
    tags: ['japanese', 'sushi', 'omakase'],
  },
];

export const JAPANESE_IN_UBUD: readonly BaliPlace[] = [
  ['Ubud Ramen Ya', 4.4, 3.9, '11:00', '23:00'],
  ['Izakaya Monkey Forest', -4.4, 3.9, '17:00', '23:30'],
  ['Mama San Bento', 4.4, -3.9, '10:00', '21:00'],
  ['Tempura Kebun', -4.4, -3.9, '11:00', '21:30'],
].map(([name, north, east, start, end]) => ({
  name: name as string,
  category: 'food',
  at: fromVilla(north as number, east as number),
  address: 'Jl. Monkey Forest, Ubud, Gianyar Regency',
  hours: hours(start as string, end as string),
  tags: ['japanese'],
}));
