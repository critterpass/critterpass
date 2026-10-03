/**
 * The line under a place says when it fits, worded from the fit's codes the way the renders read:
 * the best day and its time, on the way, open late, after a stop, the crew's split first, and a day
 * that only works if a stop moves.
 */
import { i18n as lingui } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayFit, FitReason, PlaceFit } from '@cp/domain';

import { fitLine, type FitLineContext } from '../fit-line';

beforeAll(() => {
  lingui.loadAndActivate({ locale: 'en', messages: {} });
});

const TZ = 'Asia/Makassar';
const SAT = '0192f000-0000-7000-8000-0000000000d6';
const WED = '0192f000-0000-7000-8000-0000000000d3';
const LUNCH = '0192f000-0000-7000-8000-0000000000e2';
const TIRTA = '0192f000-0000-7000-8000-0000000000e3';

const context: FitLineContext = {
  weekdays: new Map([
    [3, 'Wed'],
    [6, 'Sat'],
  ]),
  tz: TZ,
  stopName: (id) => (id === LUNCH ? 'lunch' : id === TIRTA ? 'Tirta Empul' : null),
};

function day(
  dayNo: number,
  dayId: string,
  grade: DayFit['grade'],
  startsAt: string | null,
  reasons: FitReason[] = [],
  extra: Partial<DayFit> = {},
): DayFit {
  return {
    day_id: dayId,
    day_no: dayNo,
    grade,
    slot: startsAt === null ? null : { starts_at: startsAt, ends_at: startsAt },
    reasons,
    ...extra,
  };
}

function fit(days: DayFit[], bestId: string | null): PlaceFit {
  const best = days.find((entry) => entry.day_id === bestId);
  return {
    poi_id: null,
    best:
      best === undefined || best.slot === null
        ? null
        : { day_id: best.day_id, day_no: best.day_no, grade: best.grade, slot: best.slot },
    days,
  };
}

// 08:00 and 16:00 in Bali (UTC+8).
const SAT_0800 = '2026-10-17T00:00:00.000Z';
const WED_1600 = '2026-10-14T08:00:00.000Z';
const WED_1930 = '2026-10-14T11:30:00.000Z';

describe('fitLine', () => {
  it('names the best day and its time on the trip clock', () => {
    const line = fitLine(fit([day(6, SAT, 'good', SAT_0800)], SAT), context);
    expect(line).toEqual({ text: 'Fits Sat at 08:00', tone: 'fits' });
  });

  it('says on the way, open late or after a stop when the reason says so', () => {
    const onTheWay: FitReason = {
      code: 'on_the_way',
      params: { stable_id: LUNCH, detour_minutes: 6 },
    };
    expect(fitLine(fit([day(3, WED, 'good', WED_1600, [onTheWay])], WED), context)?.text).toBe(
      'On the way, Wed 16:00',
    );
    const late: FitReason = { code: 'closes_at', params: { time: '23:00' } };
    expect(fitLine(fit([day(3, WED, 'good', WED_1930, [late])], WED), context)?.text).toBe(
      'Open late · fits Wed night',
    );
    const after: FitReason = { code: 'after_item', params: { stable_id: TIRTA } };
    expect(fitLine(fit([day(6, SAT, 'good', SAT_0800, [after])], SAT), context)?.text).toBe(
      'Fits Sat, after Tirta Empul',
    );
  });

  it("puts the crew's split before any day", () => {
    const split: FitReason = { code: 'crew_split', params: { want: 2, rather_not: 2 } };
    expect(fitLine(fit([day(6, SAT, 'possible', SAT_0800, [split])], SAT), context)).toEqual({
      text: 'The crew is split 2–2',
      tone: 'split',
    });
  });

  it('says which stop has to move when a day only fits that way', () => {
    const moving = day(3, WED, 'possible', WED_1600, [], { needs_move: LUNCH });
    expect(fitLine(fit([moving], WED), context)).toEqual({
      text: 'Only fits if Wed lunch moves',
      tone: 'needsMove',
    });
    const noDay = day(3, WED, 'no', null, [], { needs_move: LUNCH });
    expect(fitLine(fit([noDay], null), context)?.tone).toBe('needsMove');
  });

  it('is quiet when nothing fits, and empty with no fit worked out', () => {
    expect(fitLine(fit([day(6, SAT, 'no', null)], null), context)?.tone).toBe('none');
    expect(fitLine(null, context)).toBeNull();
  });
});
