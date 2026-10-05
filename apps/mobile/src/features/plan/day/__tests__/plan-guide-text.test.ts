/**
 * The plan's guide text in the app's language: the day view shows a stop's note and a day's theme
 * translated when a current translation synced with the row, while the plan state edits replay on
 * keeps the words as written; the overview does the same for its day cards and labels.
 */
import { guideTextSourceHash } from '@cp/domain';
import { i18n as lingui } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { toPlanDays, toPlanItems } from '../../overview/model/plan-model';
import {
  dayItems,
  displayOf,
  type ModelDayRow as PlanDayRow,
  type ModelItemRow as PlanItemRow,
  placeNamesOf,
  themesAsRead,
  toPlanState,
} from '@/data/plan/plan-model';
import { type PlanItemRow as OverviewItemRow } from '@/data/plan/queries';

beforeAll(() => {
  lingui.loadAndActivate({ locale: 'en', messages: {} });
});

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

  it("never titles a guide's stop by its note: its kind names it, the note stays a note", () => {
    const { items } = read([item({ poi_id: null, poi_name: null, category: 'meal' })], 'vi');
    expect(items[0]).toMatchObject({ title: 'Meal', notes: NOTE_VI });
  });

  it("names a stop by the plan's own place name when the phone's catalogue has none", () => {
    const rows = [item({ poi_name: null })];
    const state = toPlanState([DAY], rows);
    const places = placeNamesOf(
      JSON.stringify({ places: { 'poi-1': { name: 'Mì Quảng Bà Mua' } } }),
    );
    const items = dayItems(state, 1, displayOf(rows, 'en', places), 'Asia/Ho_Chi_Minh');
    expect(items[0]).toMatchObject({ title: 'Mì Quảng Bà Mua', notes: NOTE });
    // Without the version's names it reads as its kind, never as the note.
    expect(read(rows, 'en').items[0]?.title).toBe('Activity');
  });

  it("names a person's own stop (no place) by what they typed", () => {
    const typed = 'Coffee with Linh';
    const rows = [
      item({ poi_id: null, poi_name: null, created_by_kind: 'user', notes: typed, i18n: null }),
    ];
    expect(read(rows, 'en').items[0]?.title).toBe(typed);
  });

  it('reads the place names out of the version, and nothing out of a broken record', () => {
    expect(placeNamesOf(null).size).toBe(0);
    expect(placeNamesOf('not json').size).toBe(0);
    expect(
      placeNamesOf(JSON.stringify({ places: { a: { name: ' ' }, b: { name: 'Ba Na' } } })).get('b'),
    ).toBe('Ba Na');
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
  it('shows day themes in the app language, and names stops as the day view does', () => {
    expect(toPlanDays([{ id: 'day-one', ...DAY }], 'vi')[0]?.theme).toBe(THEME_VI);
    expect(toPlanDays([{ id: 'day-one', ...DAY }], 'en')[0]?.theme).toBe(THEME);
    const row: OverviewItemRow = {
      ...item({ poi_id: null, poi_name: null }),
      id: 'i1',
      lat: null,
      lng: null,
      booking_title: null,
    };
    // A guide's stop with no place is its kind, never its note.
    expect(toPlanItems([{ ...row, category: 'meal' }], 'vi')[0]?.label).toBe('Meal');
    expect(toPlanItems([{ ...row, poi_name: 'Dragon Bridge' }], 'vi')[0]?.label).toBe(
      'Dragon Bridge',
    );
    // The version's own name, then the catalogue's, then the booking's title.
    const placed: OverviewItemRow = { ...row, poi_id: 'poi-1', poi_name: 'Catalogue name' };
    const places = placeNamesOf(
      JSON.stringify({ places: { 'poi-1': { name: 'Mì Quảng Bà Mua' } } }),
    );
    expect(toPlanItems([placed], 'en', places)[0]?.label).toBe('Mì Quảng Bà Mua');
    expect(toPlanItems([placed], 'en')[0]?.label).toBe('Catalogue name');
    // A place named in two languages is named by the shared rule, ahead of the plan's record.
    const both = { ...placed, poi_name: 'Valley of Love', poi_name_local: 'Thung lũng Tình Yêu' };
    expect(toPlanItems([both], 'en', places)[0]?.label).toBe('Valley of Love');
    expect(toPlanItems([{ ...row, booking_title: 'Ba Na Hills tickets' }], 'en')[0]?.label).toBe(
      'Ba Na Hills tickets',
    );
    // Both views use the one naming rule.
    const dayRows = [item({ poi_name: null })];
    const dayTitle = dayItems(
      toPlanState([DAY], dayRows),
      1,
      displayOf(dayRows, 'en', places),
      'Asia/Ho_Chi_Minh',
    )[0]?.title;
    expect(dayTitle).toBe(toPlanItems([{ ...row, poi_id: 'poi-1' }], 'en', places)[0]?.label);
  });
});
