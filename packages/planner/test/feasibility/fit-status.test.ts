import { describe, expect, it } from 'vitest';

import { checkFeasibility } from '../../src/feasibility/check';
import { fitForViewer, postDraftFit, preDraftFit } from '../../src/feasibility/fit-status';
import { ALWAYS_OPEN, CREW, GOOD_DAY, GOOD_TRAVEL, MUSEUM_HOURS, matrix } from './fixtures';

const DATES = [
  '2027-04-02',
  '2027-04-03',
  '2027-04-04',
  '2027-04-05',
  '2027-04-06',
  '2027-04-07',
  '2027-04-08',
  '2027-04-09',
];

describe('pre-draft must-do fit', () => {
  it('fits when several days have the place open with room to spare', () => {
    expect(preDraftFit({ hours: MUSEUM_HOURS, durationMin: 120, dates: DATES })).toBe('fits');
  });

  it('is tight when only one day works, and clash when none does', () => {
    const busy = Object.fromEntries(
      DATES.filter((d) => d !== '2027-04-07').map((d) => [d, [{ startMin: 600, endMin: 1020 }]]),
    );
    expect(preDraftFit({ hours: MUSEUM_HOURS, durationMin: 120, dates: DATES, busy })).toBe(
      'tight',
    );
    expect(preDraftFit({ hours: MUSEUM_HOURS, durationMin: 120, dates: ['2027-04-05'] })).toBe(
      'clash',
    );
    expect(preDraftFit({ hours: MUSEUM_HOURS, durationMin: 480, dates: DATES })).toBe('clash');
  });

  it('is unknown without hours or dates, and honours date exceptions', () => {
    expect(preDraftFit({ hours: null, durationMin: 60, dates: DATES })).toBe('unknown');
    expect(preDraftFit({ hours: MUSEUM_HOURS, durationMin: 60, dates: [] })).toBe('unknown');
    const closedTuesday = { ...MUSEUM_HOURS, exceptions: [{ date: '2027-04-06', spans: [] }] };
    expect(preDraftFit({ hours: closedTuesday, durationMin: 60, dates: ['2027-04-06'] })).toBe(
      'clash',
    );
    expect(preDraftFit({ hours: ALWAYS_OPEN, durationMin: 60, dates: ['2027-04-06'] })).toBe(
      'fits',
    );
  });

  it('suggests a fit in under 20 ms per candidate', () => {
    const runs = 200;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) {
      preDraftFit({ hours: MUSEUM_HOURS, durationMin: 90 + (i % 4) * 15, dates: DATES });
    }
    expect((performance.now() - started) / runs).toBeLessThan(20);
  });
});

describe('post-draft must-do fit and who sees what', () => {
  const input = { items: GOOD_DAY, members: CREW, travel: GOOD_TRAVEL };

  it('fits, tight or clash from the must-do item', () => {
    expect(postDraftFit('md-inari', checkFeasibility(input), GOOD_DAY)).toEqual({
      status: 'fits',
      dayNo: 5,
    });
    const withMarket = GOOD_DAY.map((i) =>
      i.stableId === 'market' ? { ...i, mustDoId: 'md-market' } : i,
    );
    const tight = checkFeasibility({
      ...input,
      items: withMarket,
      travel: matrix({ 'inari>market': 80 }),
    });
    expect(postDraftFit('md-market', tight, withMarket)).toEqual({ status: 'tight', dayNo: 5 });
    const clash = checkFeasibility({ ...input, travel: matrix({ 'inari>market': 200 }) });
    expect(postDraftFit('md-inari', clash, GOOD_DAY).status).toBe('clash');
    expect(postDraftFit('md-missing', clash, GOOD_DAY)).toEqual({ status: 'clash', dayNo: null });
  });

  it('members see the status only; the organiser also sees the day', () => {
    const fit = postDraftFit('md-inari', checkFeasibility(input), GOOD_DAY);
    expect(fitForViewer(fit, 'member')).toEqual({ status: 'fits' });
    expect(fitForViewer(fit, 'organiser')).toEqual({ status: 'fits', dayNo: 5 });
  });
});
