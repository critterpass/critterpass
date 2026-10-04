/**
 * A Bali trip for the planning map lab: 500 places around Ubud (the first fourteen saved by the
 * crew, the rest Tokek's suggestions), three days of stops, and the villa. Positions are drawn
 * from a fixed seed, so every run and every screenshot shows the same map.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab fixture names, loaded only by the (dev) lab. */
import { tokens } from '@cp/design-tokens';

import type { PlaceDot } from '../place-dots';
import type { Coord, RouteDay } from '../route-trace';

export const UBUD: Coord = [115.2625, -8.5069];
export const VILLA: Coord = [115.258, -8.515];
export const TIRTA_EMPUL: Coord = [115.2681, -8.4925];

const SAVED_NAMES = [
  'Tirta Empul',
  'Seniman Coffee',
  'Pura Lempuyang',
  'Tibumana',
  'Goa Gajah',
  'Gianyar Night Market',
  'Single Fin',
  'Sari Organik',
  'Tukad Cepung',
  "Murni's Warung",
  'Tegallalang',
  'Monkey Forest',
  'Kopi Kultur',
  'Pura Taman Saraswati',
] as const;

const MEMBER = tokens.member.colors;
/** The map style's category sprites (the domain's category icon keys). */
const SPRITES = [
  'pin-temple-shrine',
  'pin-food',
  'pin-market',
  'pin-nature',
  'pin-beach',
  'pin-museum',
  'pin-nightlife',
  'pin-shopping',
  'pin-transit',
  'pin-stay',
  'pin-health',
  'pin-other',
] as const;

/** A small fixed-seed generator (mulberry32): the same 500 places on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LabPlace extends PlaceDot {
  readonly name: string;
}

export function baliPlaces(count = 500): readonly LabPlace[] {
  const random = seeded(14);
  const places: LabPlace[] = [];
  for (let index = 0; index < count; index += 1) {
    const saved = index < SAVED_NAMES.length;
    // Spread over about 20 × 20 km, denser near the centre like a real town.
    const r = 0.09 * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const at: Coord =
      index === 0 ? TIRTA_EMPUL : [UBUD[0] + r * Math.cos(angle), UBUD[1] + r * Math.sin(angle)];
    places.push({
      id: `lab-place-${String(index)}`,
      name: SAVED_NAMES[index] ?? `Place ${String(index)}`,
      lng: at[0],
      lat: at[1],
      tier: saved ? 'saved' : 'suggested',
      iconKey: SPRITES[index % SPRITES.length] ?? 'pin-other',
      relevance: saved ? (index % 4) + (index < 3 ? 1 : 0) : Math.floor(random() * 2),
      badgeColor: saved ? MEMBER[index % MEMBER.length] : undefined,
    });
  }
  return places;
}

export interface LabStop {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

function stops(day: number, list: readonly (readonly [string, number, number])[]): LabStop[] {
  return list.map(([name, lng, lat], index) => ({
    id: `lab-stop-${String(day)}-${String(index + 1)}`,
    n: index + 1,
    name,
    lng,
    lat,
  }));
}

export interface LabDay extends RouteDay {
  readonly title: string;
  readonly stops: readonly LabStop[];
}

export const LAB_DAYS: readonly LabDay[] = [
  {
    dayNo: 2,
    title: 'Ubud centre',
    color: tokens.color.pink,
    stops: stops(2, [
      ['Cooking class', 115.2702, -8.5003],
      ['Monkey Forest', 115.2588, -8.5188],
      ['Ubud Palace', 115.2635, -8.5069],
      ['Night market', 115.2669, -8.5101],
    ]),
  },
  {
    dayNo: 3,
    title: 'Slow Ubud',
    color: tokens.color.blue,
    stops: stops(3, [
      ['Jatiluwih', 115.1316, -8.3706],
      ['Biah Biah', 115.2636, -8.5068],
      ['Campuhan Ridge', 115.2543, -8.5031],
      ['Karsa Spa', 115.2511, -8.4948],
      ['Sari Organik', 115.2632, -8.5102],
    ]),
  },
  {
    dayNo: 4,
    title: 'Batur sunrise',
    color: tokens.color.orange,
    stops: stops(4, [
      ['Batur trailhead', 115.3681, -8.2717],
      ['Hot springs', 115.3755, -8.2593],
      ['Coffee farm', 115.3007, -8.4312],
    ]),
  },
];
