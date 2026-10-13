/**
 * Lab data for the critter scenes: the real 150-critter catalogue from the renderer's own data,
 * shaped like synced rows, with a traveller from Vietnam who has found three of the home set and is
 * in Bali now. Names appear only on the fixture's verified finds, like on a real phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { critters, findDesignedForm, places } from '@cp/critter-art';

import type { CritterRow, EntryRow, FormRow, SetRow, TripRow, WindowRow } from '../data/queries';
import type { DexInput } from '../dex/dex-model';

const setId = (code: string) => `set-${code}`;
const HERO: Readonly<Record<string, string>> = { id: 'cp-112', jp: 'cp-061' };

export const LAB_SETS: readonly SetRow[] = places.map((place) => ({
  id: setId(place.code),
  code: place.code,
  name: place.name,
  country: place.code.toUpperCase(),
  rank: place.rank,
  set_group: place.setGroup,
  destination_id: null,
  hero_critter_key: HERO[place.code] ?? place.critterIds[0] ?? null,
  guide_slug: null,
}));

export const LAB_CRITTERS: readonly CritterRow[] = critters.map((critter) => ({
  id: critter.id,
  key: critter.id,
  set_id: setId(critter.code),
  no: critter.no,
  city: critter.city,
  canonical_seed: critter.no,
}));

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
const REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  'cp-112': ['Be in Bali', 'Three water temples', 'Batur by sunrise', 'All six at the top'],
};

/** Four forms per guide (the here-now card), one per local. */
export const LAB_FORMS: readonly FormRow[] = critters.flatMap((critter) =>
  (critter.id in HERO || Object.values(HERO).includes(critter.id)
    ? RARITIES
    : RARITIES.slice(0, 1)
  ).map((rarity, index) => {
    const designed = findDesignedForm(critter.id, rarity)?.form;
    return {
      id: `${critter.id}-${rarity}`,
      key: null,
      critter_id: critter.id,
      rarity,
      palette: designed === undefined ? null : JSON.stringify(designed.palette),
      pose: designed?.pose ?? null,
      edge: designed?.edge ?? 'none',
      requirement_copy: REQUIREMENTS[critter.id]?.[index] ?? `Be in ${critter.city}`,
      xp: [50, 150, 300, 1000][index] ?? 50,
    };
  }),
);

function found(critterId: string, rarity: string, name: string): EntryRow {
  return {
    id: `entry-${critterId}-${rarity}`,
    form_id: `${critterId}-${rarity}`,
    critter_id: critterId,
    verification: 'verified',
    critter_name: name,
    form_name: name,
    found_at: '2026-10-02T03:42:00Z',
    poi_id: null,
    trip_id: null,
    source: 'encounter',
    encounter_id: null,
    poi_name: 'Tirta Empul',
  };
}

export const LAB_ENTRIES: readonly EntryRow[] = [
  found('cp-001', 'common', 'Cụ Rùa'),
  found('cp-005', 'common', 'Chép'),
  found('cp-007', 'common', 'Chào Mào'),
  found('cp-011', 'common', critters[10]?.name ?? ''),
  found('cp-112', 'common', 'Tokek'),
  found('cp-112', 'rare', 'Tokek'),
];

export const LAB_WINDOWS: readonly WindowRow[] = [
  {
    id: 'window-sakura',
    key: 'sakura-pon',
    form_id: 'cp-061-legendary',
    place_line: 'Kyoto · the week the blossoms peak',
    rule: JSON.stringify({ type: 'annual_range', start: '04-02', end: '04-09' }),
    months: JSON.stringify([4]),
    solar: 'after_dark',
    challenge: null,
  },
];

export function labTrip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: 'trip-bali',
    crew_id: 'crew',
    status: 'in_trip',
    start_date: '2027-03-30',
    end_date: '2027-04-06',
    tz: 'Asia/Makassar',
    destination_id: 'dest-bali',
    destination_name: 'Bali',
    destination_country: 'ID',
    colour: null,
    critter_set_id: setId('id'),
    guide_slug: 'tokek',
    guide_name: 'Tokek',
    guide_id: 'guide-tokek',
    landed_at: '2027-03-30T05:50:00Z',
    rsvp: 'in',
    egg_id: 'egg-bali',
    egg_form_id: 'cp-112-common',
    egg_hatched_at: '2027-03-30T05:50:00Z',
    egg_trigger: 'landed',
    ...overrides,
  };
}

export function labDexInput(overrides: Partial<DexInput> = {}): DexInput {
  return {
    sets: LAB_SETS,
    critters: LAB_CRITTERS,
    forms: LAB_FORMS,
    entries: LAB_ENTRIES,
    windows: LAB_WINDOWS,
    trips: [labTrip()],
    me: {
      id: 'me',
      display_name: 'Winston',
      home_country: 'VN',
      explore_at_home: 0,
      hide_collection: 0,
      active_crew_id: 'crew',
    },
    crewCounts: [{ user_id: 'maya', critters: 14, forms: 19, display_name: 'Maya' }],
    ...overrides,
  };
}
