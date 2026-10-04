import { describe, expect, it } from 'vitest';

import { checkCrowdWeek } from '../src/kinds/places/crowds';
import { renderCrowdReview } from '../src/kinds/places/crowds-review';

const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const;
const temple = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
      day,
      [{ start: '08:00', end: '18:00' }],
    ]),
  ),
};
const shape = (hour: number) => (hour < 8 ? 40 : hour < 10 ? 20 : hour < 14 ? 85 : 50);
const weekOf = (level: (hour: number) => number) => ({
  week: Object.fromEntries(
    DAYS.map((day) => [day, Array.from({ length: 24 }, (_, h) => level(h))]),
  ) as Record<(typeof DAYS)[number], number[]>,
});

describe('editorial crowd curve checks', () => {
  it('keeps a shaped week and zeroes the hours the place is shut', () => {
    const check = checkCrowdWeek(temple, weekOf(shape));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.week).toHaveLength(7);
    expect(check.week[0]?.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(check.week[6]?.[10]).toBe(85);
    expect(check.week[6]?.[18]).toBe(0);
  });

  it('rejects levels outside 0-100, a short day and a flat guess', () => {
    expect(
      checkCrowdWeek(
        temple,
        weekOf(() => 140),
      ),
    ).toEqual({
      ok: false,
      reason: 'su has a level outside 0-100',
    });
    const short = weekOf(shape);
    short.week.we = short.week.we.slice(0, 20);
    expect(checkCrowdWeek(temple, short)).toEqual({ ok: false, reason: 'we has 20 hours' });
    expect(
      checkCrowdWeek(
        temple,
        weekOf(() => 50),
      ),
    ).toEqual({
      ok: false,
      reason: 'open hours are flat',
    });
  });

  it('keeps an overnight bar open past midnight', () => {
    const bar = {
      weekly: { fr: [{ start: '20:00', end: '02:00' }], sa: [{ start: '20:00', end: '02:00' }] },
    };
    const check = checkCrowdWeek(
      bar,
      weekOf((h) => (h >= 22 || h < 2 ? 90 : 30)),
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.week[6]?.[1]).toBe(90);
    expect(check.week[6]?.[12]).toBe(0);
  });

  it('the review page shows each place with its bars and the month index', () => {
    const html = renderCrowdReview(
      [
        {
          slug: 'bali',
          name: 'Bali',
          months: [
            { month: 7, crowdIndex: 90 },
            { month: 10, crowdIndex: 50 },
          ],
          places: [
            {
              name: 'Tirta Empul <temple>',
              category: 'temple_shrine',
              crowdHint: 'Tour buses from 10',
              bestTime: 'At opening',
              week: [
                Array.from({ length: 24 }, (_, h) => shape(h)),
                null,
                null,
                null,
                null,
                null,
                null,
              ],
            },
          ],
        },
      ],
      '2026-10-05-crowds',
    );
    expect(html).toContain('Tirta Empul &lt;temple&gt;');
    expect(html).toContain('Oct<br><b>50</b>');
    expect(html.match(/<i style=/g)).toHaveLength(24);
  });
});
