/**
 * The trailer plays slides about stops in the plan's order, and leaves the guide's opening and
 * closing slides where they are.
 */
import { describe, expect, it } from '@jest/globals';

import type { StopTime } from '../data/picks';
import { slidesInPlanOrder } from '../trailer/slide-order';

const slide = (headline: string, item_id: string | null) => ({ headline, body: '', item_id });
const at = (dayNo: number, startsAt: string): StopTime => ({ dayNo, startsAt, tz: null });

describe('trailer slides', () => {
  it('plays stops day by day, earlier first, around the opening and closing slides', () => {
    const stops = new Map([
      ['noodles', at(1, '2026-10-19T09:00:00Z')],
      ['beach', at(1, '2026-10-19T07:00:00Z')],
      ['market', at(2, '2026-10-20T11:00:00Z')],
    ]);
    const ordered = slidesInPlanOrder(
      [
        slide('Đà Nẵng, three days', null),
        slide('Mì Quảng', 'noodles'),
        slide('Night market', 'market'),
        slide('Beach', 'beach'),
        slide('Are you in?', null),
      ],
      stops,
    );
    expect(ordered.map((s) => s.headline)).toEqual([
      'Đà Nẵng, three days',
      'Beach',
      'Mì Quảng',
      'Night market',
      'Are you in?',
    ]);
  });

  it('leaves the story as written while the plan is not on the phone', () => {
    const slides = [slide('Mì Quảng', 'noodles'), slide('Beach', 'beach')];
    expect(slidesInPlanOrder(slides, new Map())).toEqual(slides);
  });
});
