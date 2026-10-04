/** The Bali Six and the stops of their eight days, for the section 7 plan lab (bali-trip.ts). */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
const uuid = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const LAB_CREW = [
  { uid: uuid(1), name: 'Winston', joinIndex: 0 },
  { uid: uuid(2), name: 'Maya', joinIndex: 1 },
  { uid: uuid(3), name: 'Alex', joinIndex: 2 },
  { uid: uuid(4), name: 'Jordan', joinIndex: 3 },
  { uid: uuid(5), name: 'Rin', joinIndex: 4 },
  { uid: uuid(6), name: 'Dev', joinIndex: 5 },
] as const;
export const [, MAYA, , , RIN] = LAB_CREW;

export interface Seed {
  readonly n: number;
  readonly day: number;
  readonly from: string;
  readonly minutes: number;
  readonly name: string;
  readonly lng: number;
  readonly lat: number;
  readonly category?: string;
  readonly booked?: boolean;
  readonly who?: readonly string[];
  readonly price?: number;
}

export const SEEDS: readonly Seed[] = [
  {
    n: 101,
    day: 1,
    from: '11:40',
    minutes: 60,
    name: 'Driver from DPS',
    lng: 115.167,
    lat: -8.748,
    booked: true,
    category: 'transit',
  },
  {
    n: 102,
    day: 1,
    from: '15:00',
    minutes: 60,
    name: 'Villa check-in',
    lng: 115.258,
    lat: -8.515,
    booked: true,
    category: 'stay',
  },
  { n: 103, day: 1, from: '16:30', minutes: 120, name: 'Pool', lng: 115.258, lat: -8.5152 },
  {
    n: 201,
    day: 2,
    from: '09:00',
    minutes: 180,
    name: 'Cooking class',
    lng: 115.2702,
    lat: -8.5003,
    category: 'food',
  },
  {
    n: 202,
    day: 2,
    from: '11:30',
    minutes: 120,
    name: 'Monkey Forest',
    lng: 115.2588,
    lat: -8.5188,
    category: 'nature',
  },
  { n: 203, day: 2, from: '14:00', minutes: 90, name: 'Ubud Palace', lng: 115.2635, lat: -8.5069 },
  {
    n: 204,
    day: 2,
    from: '18:00',
    minutes: 120,
    name: 'Night market',
    lng: 115.2669,
    lat: -8.5101,
    category: 'market',
  },
  {
    n: 301,
    day: 3,
    from: '09:00',
    minutes: 210,
    name: 'Jatiluwih terraces',
    lng: 115.1316,
    lat: -8.3706,
    category: 'nature',
  },
  {
    n: 302,
    day: 3,
    from: '13:00',
    minutes: 60,
    name: 'Lunch · Biah Biah',
    lng: 115.2642,
    lat: -8.5072,
    category: 'food',
    price: 6_000_000,
  },
  {
    n: 303,
    day: 3,
    from: '14:00',
    minutes: 90,
    name: 'Campuhan ridge walk',
    lng: 115.2543,
    lat: -8.5009,
    category: 'nature',
  },
  {
    n: 304,
    day: 3,
    from: '16:00',
    minutes: 120,
    name: 'Karsa spa',
    lng: 115.2598,
    lat: -8.4935,
    category: 'health',
    who: [MAYA.uid, RIN.uid],
  },
  {
    n: 305,
    day: 3,
    from: '19:30',
    minutes: 120,
    name: 'Locavore NXT',
    lng: 115.2615,
    lat: -8.5124,
    category: 'food',
  },
  {
    n: 401,
    day: 4,
    from: '03:30',
    minutes: 300,
    name: 'Batur sunrise trek',
    lng: 115.3751,
    lat: -8.2421,
    booked: true,
  },
  { n: 402, day: 4, from: '10:00', minutes: 90, name: 'Hot springs', lng: 115.4, lat: -8.276 },
  {
    n: 501,
    day: 5,
    from: '08:00',
    minutes: 480,
    name: 'Nusa Penida or Gili T',
    lng: 115.544,
    lat: -8.727,
    category: 'beach',
  },
  {
    n: 701,
    day: 7,
    from: '15:00',
    minutes: 120,
    name: 'Temple at sunset',
    lng: 115.085,
    lat: -8.829,
    category: 'temple_shrine',
  },
  { n: 702, day: 7, from: '18:00', minutes: 90, name: 'Kecak', lng: 115.0849, lat: -8.8292 },
  { n: 801, day: 8, from: '11:00', minutes: 60, name: 'Check out', lng: 115.258, lat: -8.515 },
  {
    n: 802,
    day: 8,
    from: '15:20',
    minutes: 60,
    name: 'DPS flight',
    lng: 115.167,
    lat: -8.748,
    booked: true,
    category: 'transit',
  },
];
