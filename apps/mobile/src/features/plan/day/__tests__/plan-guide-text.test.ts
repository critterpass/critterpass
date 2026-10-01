/**
 * The plan's guide text in the app's language: the day view shows a stop's note and a day's theme
 * translated when a current translation synced with the row, while the plan state edits replay on
 * keeps the words as written; the overview does the same for its day cards and labels.
 */
import { guideTextSourceHash } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { toPlanDays, toPlanItems } from '../../overview/model/plan-model';
import type { PlanItemRow as OverviewItemRow } from '../../overview/data/plan-rows';
import {
  dayItems,
  displayOf,
  themesAsRead,
  toPlanState,
  type PlanDayRow,
  type PlanItemRow,
} from '../plan-model';

const NOTE = 'Dragon Bridge breathes fire at 21:00 on weekends.';
const NOTE_VI = 'Dragon Bridge phun lửa lúc 21:00 cuối tuần.';
const THEME = 'Beach day, slow start';
const THEME_VI = 'Ngày biển, khởi động chậm thôi';

const i18n = (kind: 'plan_item' | 'plan_day', source: Record<string, string>, vi: object) =>
  JSON.stringify({ _src: guideTextSourceHash(kind, source), vi });

const DAY: PlanDayRow = {
  day_no: 1,
  date: '2026-10-02',
  theme: THEME,
  i18n: i18n('plan_day', { theme: THEME }, { theme: THEME_VI }),
};

function item(overrides: Partial<PlanItemRow>): PlanItemRow {
  return {
    stable_id: 'bridge',
    day_no: 1,
    starts_at: '2026-10-02T14:00:00.000Z',
    ends_at: null,
    tz: 'Asia/Ho_Chi_Minh',
    lane: null,
    attendee_ids: null,
    poi_id: 'poi-1',
    booking_id: null,
    must_do_id: null,
    category: 'sight',
    cost_model: null,
    amount_minor: null,
    currency: null,
    status: 'confirmed',
    is_outdoor: 1,
    created_by_kind: 'guide',
    notes: NOTE,
    locked_reason: null,
    i18n: i18n('plan_item', { notes: NOTE }, { notes: NOTE_VI }),
    poi_name: 'Dragon Bridge',
    poi_lat: 16.06,
    poi_lng: 108.23,
    ...overrides,
  };
}

function read(rows: readonly PlanItemRow[], locale: string) {
  const state = toPlanState([DAY], rows);
  return {
    state,
    items: dayItems(state, 1, displayOf(rows, locale), 'Asia/Ho_Chi_Minh'),
  };
}

describe('the day view', () => {
  it("shows the guide's note in Vietnamese and keeps the written words in the plan state", () => {
    const { state, items } = read([item({})], 'vi');
    expect(items[0]).toMatchObject({ title: 'Dragon Bridge', notes: NOTE_VI });
    expect(state.items[0]?.notes).toBe(NOTE);
    expect(read([item({})], 'en').items[0]?.notes).toBe(NOTE);
  });

  it('titles a stop without a place by its translated note', () => {
    const { items } = read([item({ poi_id: null, poi_name: null })], 'vi');
    expect(items[0]?.title).toBe(NOTE_VI);
  });

  it('shows a note someone edited as typed, in every language', () => {
    const edited = 'Skip the bridge, meet at the night market.';
    const { items } = read([item({ notes: edited })], 'vi');
    expect(items[0]?.notes).toBe(edited);
  });

  it('reads a row that has no translations yet as written', () => {
    expect(read([item({ i18n: null })], 'vi').items[0]?.notes).toBe(NOTE);
  });

  it('maps each theme as written to the theme as read', () => {
    expect(themesAsRead([DAY], 'vi').get(THEME)).toBe(THEME_VI);
    expect(themesAsRead([DAY], 'en').get(THEME)).toBe(THEME);
    expect(themesAsRead([{ ...DAY, theme: 'Changed by hand' }], 'vi').get('Changed by hand')).toBe(
      'Changed by hand',
    );
  });
});

describe('the overview', () => {
  it('shows day themes and place-less labels in the app language', () => {
    expect(toPlanDays([{ id: 'day-one', ...DAY }], 'vi')[0]?.theme).toBe(THEME_VI);
    expect(toPlanDays([{ id: 'day-one', ...DAY }], 'en')[0]?.theme).toBe(THEME);
    const row: OverviewItemRow = {
      ...item({ poi_id: null, poi_name: null }),
      id: 'i1',
      lat: null,
      lng: null,
      booking_title: null,
    };
    expect(toPlanItems([row], 'vi')[0]?.label).toBe(NOTE_VI);
    expect(toPlanItems([{ ...row, poi_name: 'Dragon Bridge' }], 'vi')[0]?.label).toBe(
      'Dragon Bridge',
    );
  });
});
