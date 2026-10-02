/**
 * Timeline overlays from synced rows: the rain window is the longest wet run of the day's hourly
 * forecast (none without a snapshot); the guide's ghost comes from an open weather change set
 * moving one of the day's items (a seeded row, as the guide's weather job writes it); and a
 * friend's cursor sits on their item's block, shifted by the minutes they are dragging it.
 */
import { describe, expect, it } from '@jest/globals';

import { LAB_DATE, LAB_ITEMS, LAB_MEMBERS, LAB_TZ, WALK } from '../../day/dev/lab-fixtures';
import { instantOnDay } from '../../day/plan-model';
import type { ChangesetRow } from '../../day/queries';
import { PT_PER_MINUTE } from '../geometry';
import { ghostFor } from '../ghost';
import { placeCursors } from '../remote-cursors';
import { rainWindow } from '../weather';

function hour(h: number, chance: number, mm = 0) {
  return {
    at: instantOnDay(LAB_DATE, h * 60, LAB_TZ),
    temp_c: 26,
    chance_of_rain: chance,
    precip_mm: mm,
    wind_kph: 8,
    gust_kph: 12,
    uv: 3,
    code: 1063,
    is_day: true,
  };
}

const forecast = JSON.stringify({
  day: { max_temp_c: 29, min_temp_c: 22, chance_of_rain: 80, precip_mm: 6, uv: 5, code: 1189 },
  hours: [
    hour(9, 70),
    hour(10, 20),
    hour(12, 30),
    hour(13, 85, 3),
    hour(14, 90, 4),
    hour(15, 10),
    hour(18, 40, 1.2),
  ],
});

describe('rain window', () => {
  it('takes the longest wet run of the day', () => {
    expect(rainWindow(forecast, LAB_TZ, LAB_DATE)).toEqual({
      kind: 'rain',
      start: 13 * 60,
      end: 15 * 60,
    });
  });

  it('is dry or unavailable without wet hours or a snapshot', () => {
    const dry = JSON.stringify({ day: {}, hours: [hour(9, 10), hour(10, 5)] });
    expect(rainWindow(dry, LAB_TZ, LAB_DATE)).toEqual({ kind: 'dry' });
    expect(rainWindow(null, LAB_TZ, LAB_DATE)).toEqual({ kind: 'unavailable' });
  });
});

const weatherSet = (overrides: Partial<ChangesetRow> = {}): ChangesetRow => ({
  id: 'cs-rain',
  trigger: 'weather',
  status: 'proposed',
  author_kind: 'guide',
  author_id: null,
  poll_id: null,
  base_version_id: 'v1',
  created_at: '2026-10-14T01:00:00Z',
  ops: JSON.stringify([
    {
      op: 'retime',
      target: WALK.stableId,
      before: { starts_at: instantOnDay(LAB_DATE, 14 * 60, LAB_TZ) },
      after: {
        starts_at: instantOnDay(LAB_DATE, 17 * 60, LAB_TZ),
        ends_at: instantOnDay(LAB_DATE, 18 * 60, LAB_TZ),
      },
      reason: 'golden hour',
      affected_user_ids: [],
      booking_impact: false,
    },
  ]),
  ...overrides,
});

describe('guide ghost', () => {
  it('draws the open weather change set where the item would go', () => {
    expect(ghostFor([weatherSet()], LAB_ITEMS, LAB_DATE)).toMatchObject({
      changesetId: 'cs-rain',
      item: { stableId: WALK.stableId },
      start: 17 * 60,
      end: 18 * 60,
      reason: 'golden hour',
    });
  });

  it('ignores other triggers, settled sets and rejected changes', () => {
    expect(ghostFor([weatherSet({ trigger: 'manual' })], LAB_ITEMS, LAB_DATE)).toBeNull();
    expect(ghostFor([weatherSet({ status: 'applied' })], LAB_ITEMS, LAB_DATE)).toBeNull();
    const rejected = weatherSet({
      ops: JSON.stringify([
        { ...(JSON.parse(weatherSet().ops ?? '[]') as object[])[0], accepted: false },
      ]),
    });
    expect(ghostFor([rejected], LAB_ITEMS, LAB_DATE)).toBeNull();
  });
});

describe('guide ghost freshness', () => {
  it('hides a suggestion made on an older plan version, and one turned down here', () => {
    expect(
      ghostFor([weatherSet()], LAB_ITEMS, LAB_DATE, { currentVersionId: 'v1' }),
    ).not.toBeNull();
    expect(ghostFor([weatherSet()], LAB_ITEMS, LAB_DATE, { currentVersionId: 'v2' })).toBeNull();
    expect(
      ghostFor([weatherSet()], LAB_ITEMS, LAB_DATE, { dismissed: new Set(['cs-rain']) }),
    ).toBeNull();
  });
});

describe('remote cursors', () => {
  it('pins a cursor to its block, shifted by the minutes being dragged', () => {
    const frames = new Map([[WALK.stableId, { top: 100, height: 40, left: 40, width: 300 }]]);
    const [still, dragging, lost] = [
      { uid: 'u-maya', anchor: `plan_item:${WALK.stableId}`, offset: 0, at: 1 },
      { uid: 'u-alex', anchor: `plan_item:${WALK.stableId}`, offset: 60, at: 2 },
      { uid: 'u-rin', anchor: 'plan_item:gone', offset: 0, at: 3 },
    ];
    const placed = placeCursors([still, dragging, lost], frames, LAB_MEMBERS);
    expect(placed.map((cursor) => cursor.uid)).toEqual(['u-maya', 'u-alex']);
    expect(placed[1]!.y - placed[0]!.y).toBeCloseTo(60 * PT_PER_MINUTE);
  });
});
