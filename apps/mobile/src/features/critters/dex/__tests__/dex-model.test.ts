import { tokens } from '@cp/design-tokens';
import { describe, expect, it } from '@jest/globals';

import type { DexInput } from '../dex-model';
import { buildDex, filterSets } from '../dex-model';

const PALETTE = JSON.stringify({
  f: [tokens.tier.common.color, tokens.tier.rare.color, tokens.tier.epic.color],
});

function input(overrides: Partial<DexInput> = {}): DexInput {
  return {
    sets: [
      {
        id: 'vn',
        code: 'vn',
        name: 'Vietnam',
        country: 'VN',
        rank: 12,
        set_group: null,
        destination_id: null,
        hero_critter_key: 'cp-091',
        guide_slug: null,
      },
      {
        id: 'fr',
        code: 'fr',
        name: 'France',
        country: 'FR',
        rank: 1,
        set_group: null,
        destination_id: null,
        hero_critter_key: null,
        guide_slug: null,
      },
      {
        id: 'id',
        code: 'id',
        name: 'Indonesia',
        country: 'ID',
        rank: 3,
        set_group: null,
        destination_id: 'bali',
        hero_critter_key: 'cp-112',
        guide_slug: 'tokek',
      },
    ],
    critters: [
      { id: 'rua', key: 'cp-091', set_id: 'vn', no: 91, city: 'Hà Nội', canonical_seed: 91 },
      { id: 'chep', key: 'cp-092', set_id: 'vn', no: 92, city: 'Hội An', canonical_seed: 92 },
      { id: 'coq', key: 'cp-001', set_id: 'fr', no: 1, city: 'Paris', canonical_seed: 1 },
      { id: 'tokek', key: 'cp-112', set_id: 'id', no: 112, city: 'Bali', canonical_seed: 7 },
    ],
    forms: [
      form('chep-c', 'chep', 'common'),
      form('tokek-c', 'tokek', 'common'),
      form('tokek-r', 'tokek', 'rare'),
      form('tokek-l', 'tokek', 'legendary'),
    ],
    entries: [
      entry('chep-c', 'chep', 'verified', 'Chép'),
      entry('tokek-r', 'tokek', 'pending', null),
    ],
    windows: [],
    trips: [],
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

function form(id: string, critter: string, rarity: 'common' | 'rare' | 'epic' | 'legendary') {
  return {
    id,
    key: null,
    critter_id: critter,
    rarity,
    palette: PALETTE,
    pose: null,
    edge: 'none',
    requirement_copy: `${rarity} requirement`,
    xp: 50,
  };
}

function entry(
  formId: string,
  critter: string,
  verification: 'pending' | 'verified' | 'revoked',
  name: string | null,
) {
  return {
    id: `e-${formId}`,
    form_id: formId,
    critter_id: critter,
    verification,
    critter_name: name,
    form_name: name,
    found_at: '2026-09-30T00:00:00Z',
    poi_id: null,
    trip_id: null,
    source: 'encounter',
    encounter_id: null,
    poi_name: null,
  };
}

const baliTrip = {
  id: 'trip',
  crew_id: 'crew',
  status: 'in_trip' as const,
  start_date: '2026-10-02',
  end_date: '2026-10-04',
  tz: 'Asia/Ho_Chi_Minh',
  destination_id: 'bali',
  destination_name: 'Bali',
  destination_country: 'ID',
  colour: null,
  critter_set_id: 'id',
  guide_slug: 'tokek',
  guide_name: 'Tokek',
  guide_id: 'g',
  landed_at: null,
  rsvp: 'in',
  egg_id: null,
  egg_form_id: null,
  egg_hatched_at: null,
  egg_trigger: null,
};

describe('Critterdex model', () => {
  it('counts distinct verified critters and places, and orders home before places by rank', () => {
    const dex = buildDex(input());
    expect([dex.found, dex.total, dex.placesFound, dex.placesTotal]).toEqual([1, 4, 1, 3]);
    expect(dex.home?.id).toBe('vn');
    expect(dex.places.map((s) => s.id)).toEqual(['fr', 'id']);
    expect(dex.comparison).toEqual({ name: 'Maya', critters: 14 });
  });

  it('names only verified finds; a pending find keeps no name and is marked pending', () => {
    const cells = buildDex(input()).places.find((s) => s.id === 'id')?.cells ?? [];
    const tokek = cells.find((c) => c.id === 'tokek');
    expect(tokek).toMatchObject({ name: null, found: false, pending: true, lit: [] });
    const chep = buildDex(input()).home?.cells.find((c) => c.id === 'chep');
    expect(chep).toMatchObject({ name: 'Chép', found: true, lit: ['common'] });
  });

  it('puts the place you are in on top with its hero critter and next form', () => {
    const dex = buildDex(input({ trips: [baliTrip] }));
    expect(dex.hereNow?.critter.id).toBe('tokek');
    expect(dex.hereNow?.forms.map((f) => [f.rarity, f.found])).toEqual([
      ['common', false],
      ['rare', false],
      ['legendary', false],
    ]);
    expect(dex.places.map((s) => s.id)).toEqual(['fr']);
  });

  it('finds a legendary whose window falls on the trip dates', () => {
    const dex = buildDex(
      input({
        trips: [baliTrip],
        windows: [
          {
            id: 'w',
            key: 'golden',
            form_id: 'tokek-l',
            place_line: 'Bali · all six on Batur',
            rule: JSON.stringify({ type: 'annual_range', start: '10-03', end: '10-05' }),
            months: null,
            solar: null,
            challenge: null,
          },
        ],
      }),
    );
    expect(dex.legendary).toMatchObject({ start: '2026-10-03', end: '2026-10-05' });
    // A guide with everyday forms keeps an ordinary silhouette; only its legendary form is gold.
    expect(dex.hereNow?.critter.gold).toBe(false);
  });

  it('draws a critter gold only when a legendary window is the one way to meet it', () => {
    const window = {
      id: 'w',
      key: 'coq-only',
      form_id: 'coq-l',
      place_line: 'Paris · one night',
      rule: JSON.stringify({ type: 'annual_range', start: '07-14', end: '07-14' }),
      months: null,
      solar: null,
      challenge: null,
    };
    const base = input();
    const dex = buildDex(
      input({ forms: [...base.forms, form('coq-l', 'coq', 'legendary')], windows: [window] }),
    );
    const cell = (id: string) =>
      [dex.home, ...dex.places].flatMap((s) => s?.cells ?? []).find((c) => c.id === id);
    expect(cell('coq')?.gold).toBe(true);
    expect(cell('rua')?.gold).toBe(false);
  });

  it('leaves the comparison out when crewmates hide their collection', () => {
    expect(buildDex(input({ crewCounts: [] })).comparison).toBeNull();
  });

  it('filters by found, near and a place search', () => {
    const dex = buildDex(input());
    const all = [...(dex.home === null ? [] : [dex.home]), ...dex.places];
    expect(filterSets(all, 'found', new Set(), '').map((s) => s.cells.map((c) => c.id))).toEqual([
      ['chep'],
      ['tokek'],
    ]);
    expect(filterSets(all, 'near', new Set(['coq']), '').map((s) => s.id)).toEqual(['fr']);
    expect(filterSets(all, 'all', new Set(), 'hội').map((s) => s.cells.map((c) => c.id))).toEqual([
      ['chep'],
    ]);
    expect(filterSets(all, 'all', new Set(), 'france')[0]?.cells).toHaveLength(1);
  });
});
