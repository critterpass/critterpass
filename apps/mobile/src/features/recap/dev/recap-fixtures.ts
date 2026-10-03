/**
 * A finished three-day Đà Nẵng trip's recap as the worker writes it (stats, route, receipt, the
 * one that got away and four awards), in the shape the recap rows sync in. The lab scenes and the
 * page's tests both start from it and change only what a scene or a case is about.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab and tests. */
import type {
  RecapCardsCopy,
  RecapGotAway,
  RecapReceipt,
  RecapRoute,
  RecapStats,
} from '@cp/domain';

import type { AwardRow, FormRow, RecapRow } from '../data/recap-rows';

export const TRIP = '0192f000-0000-7000-8000-0000000000f1';
export const CREW = '0192f000-0000-7000-8000-00000000c1e0';
export const RECAP = '0192f000-0000-7000-8000-0000000000e1';
export const DEST = '0192f000-0000-7000-8000-0000000000d1';
export const GUIDE = '0192f000-0000-7000-8000-0000000000a9';
export const MAYA = '0192f000-0000-7000-8000-0000000000a1';
export const JORDAN = '0192f000-0000-7000-8000-0000000000b2';
export const ALEX = '0192f000-0000-7000-8000-0000000000c3';
/** The viewer in the lab scenes (tests bind their own uid). */
export const ME = '0192f000-0000-7000-8000-0000000000d4';
export const CHAVA = '0192f000-0000-7000-8000-0000000001c1';
const SON_TRA = '0192f000-0000-7000-8000-000000000501';
const HOI_AN = '0192f000-0000-7000-8000-000000000502';
export const FORMS = [
  '0192f000-0000-7000-8000-000000000f01',
  '0192f000-0000-7000-8000-000000000f02',
  '0192f000-0000-7000-8000-000000000f03',
  '0192f000-0000-7000-8000-000000000f04',
] as const;

export const STATS: RecapStats = {
  start_date: '2026-10-02',
  end_date: '2026-10-04',
  days: 3,
  travellers: 4,
  distance_m: 214_000,
  distance_estimated: false,
  superlatives: [
    {
      kind: 'before_sunrise',
      poi_id: SON_TRA,
      name: 'Sơn Trà',
      category: 'nature',
      day_no: 2,
      local_date: '2026-10-03',
      local_time: '05:10',
      visited_by: 4,
    },
  ],
  photos: { count: 312, top_uploader: { user_id: MAYA, count: 140 } },
  critters: { forms_found: 3, new_critters: 2, form_ids: [FORMS[0], FORMS[1], FORMS[2]] },
  best_day: { day_no: 2, local_date: '2026-10-03', score: 9 },
};

const stop = (poi: string, name: string, day: number, time: string | null, early = false) => ({
  poi_id: poi,
  name,
  category: 'nature',
  day_from: day,
  day_to: day,
  local_time: time,
  before_sunrise: early,
});

export const ROUTE: RecapRoute = {
  stops: [
    stop('0192f000-0000-7000-8000-000000000511', 'Mỹ Khê', 1, '16:00'),
    stop(SON_TRA, 'Sơn Trà', 2, '05:10', true),
    stop('0192f000-0000-7000-8000-000000000512', 'Bà Nà', 2, '10:30'),
    stop('0192f000-0000-7000-8000-000000000513', 'Ngũ Hành Sơn', 3, '08:00'),
    stop(HOI_AN, 'Hội An', 3, '16:00'),
  ],
  legs: [
    { from: 0, to: 1, distance_m: 14_000, minutes: 25, estimate: false, ride: null },
    { from: 1, to: 2, distance_m: 48_000, minutes: 70, estimate: false, ride: null },
    { from: 2, to: 3, distance_m: 32_000, minutes: 45, estimate: false, ride: null },
    { from: 3, to: 4, distance_m: 120_000, minutes: 35, estimate: false, ride: null },
  ],
  total_m: 214_000,
  estimated: false,
  longest_leg: 1,
  ridden_m: 180_000,
  rides: 5,
  top_driver: {
    provider: 'driver',
    provider_id: null,
    provider_name: 'Anh Tuấn',
    distance_m: 180_000,
    rides: 5,
  },
};

export const RECEIPT: RecapReceipt = {
  currency: 'USD',
  lines: [{ category: 'food', total_minor: 128_400, count: 12 }],
  total_minor: 698_000,
  expenses: 23,
  meals: 12,
  travellers: 4,
  each_minor: 174_500,
  planned_each_minor: null,
  planned_total_minor: null,
  under_minor: null,
  priciest: null,
  cheapest_day: null,
  outstanding_minor: 0,
  settled: true,
  settled_on: '2026-10-02',
  settled_days_after_end: -2,
};

export const GOT_AWAY: RecapGotAway = {
  form_id: FORMS[3],
  critter_id: CHAVA,
  critter_key: 'cp-151',
  rarity: 'legendary',
  sightings: 2,
  wandered_off: 1,
  seen_by: [MAYA],
  forms_found: 3,
  forms_total: 4,
  next_window: null,
};

export const CARDS: RecapCardsCopy = {
  got_away: {
    narration: 'Seen twice on Sơn Trà, befriended by nobody.',
    line: 'Jordan slept through the second one.',
  },
};

export function recapRow(
  changes: Partial<Omit<RecapRow, 'stats' | 'route' | 'receipt' | 'got_away' | 'cards'>> & {
    readonly stats?: RecapStats | null;
    readonly route?: RecapRoute | null;
    readonly receipt?: RecapReceipt | null;
    readonly got_away?: RecapGotAway | null;
    readonly cards?: RecapCardsCopy;
  } = {},
): RecapRow {
  const json = (value: unknown) => (value === null ? null : JSON.stringify(value));
  return {
    id: RECAP,
    status: changes.status ?? 'ready',
    version: changes.version ?? 1,
    stats: json(changes.stats === undefined ? STATS : changes.stats),
    route: json(changes.route === undefined ? ROUTE : changes.route),
    receipt: json(changes.receipt === undefined ? RECEIPT : changes.receipt),
    got_away: json(changes.got_away === undefined ? GOT_AWAY : changes.got_away),
    cards: JSON.stringify(changes.cards ?? {}),
    changed_sections: changes.changed_sections ?? '[]',
    failure_reason: changes.failure_reason ?? null,
    i18n: changes.i18n ?? null,
    narration: changes.narration ?? null,
  };
}

function award(
  id: string,
  userId: string,
  name: string,
  kind: string,
  value: number,
  evidence: Record<string, unknown>,
  extra: Partial<AwardRow> = {},
): AwardRow {
  return {
    id,
    user_id: userId,
    kind,
    value,
    evidence: JSON.stringify(evidence),
    title: null,
    line: null,
    opted_out: 0,
    is_mvp: 0,
    name,
    ...extra,
  };
}

/** One award each; Jordan is the MVP, the viewer is the treasurer. */
export function awardRows(viewer: string, viewerName = 'Winston'): AwardRow[] {
  return [
    award(
      '0192f000-0000-7000-8000-00000000aa01',
      JORDAN,
      'Jordan',
      'early_riser',
      2,
      {
        earliest_time: '05:10',
      },
      { is_mvp: 1 },
    ),
    award('0192f000-0000-7000-8000-00000000aa02', MAYA, 'Maya', 'human_camera', 140, {
      share_pct: 45,
    }),
    award('0192f000-0000-7000-8000-00000000aa03', ALEX, 'Alex', 'best_find', 2, {
      poi_id: HOI_AN,
      poi_name: 'Bánh Mì Phượng',
    }),
    award('0192f000-0000-7000-8000-00000000aa04', viewer, viewerName, 'treasurer', 23, {}),
  ];
}

/** Chà Vá's four forms: three found on the trip, the golden one that got away. */
export const FORM_ROWS: readonly FormRow[] = FORMS.map((id, index) => ({
  id,
  rarity: index === 3 ? 'legendary' : index === 2 ? 'rare' : 'common',
  // No palette: each form draws in the critter's own colours.
  palette: null,
  pose: null,
  edge: index === 3 ? 'legendary' : 'none',
  critter_key: 'cp-151',
  city: 'Đà Nẵng',
  canonical_seed: 7,
}));
