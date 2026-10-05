/**
 * The plan check on an organiser's own draft: a one-tap fix and the too-far swap go to her draft;
 * a card whose fix is a screen of the crew's plan leads to the stop it is about (or the day), and
 * an issue whose day is not in the plan leads nowhere and offers nothing.
 */
import type { PlanCheckIssue } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { stopHref } from '../stop-href';
import { fixActionOf } from '../use-fix';

const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const DAY = '0192f000-0000-7000-8000-0000000000d3';
const WALK = '0192f000-0000-7000-8000-0000000000e1';
const days = [{ id: DAY, day_no: 3 }];
const issue = (over: Partial<PlanCheckIssue>) =>
  ({
    day_id: DAY,
    stable_ids: [WALK],
    fix: { kind: 'screen', screen: 'rain_crowds' },
    ...over,
  }) as PlanCheckIssue;

describe('a check card on her own draft', () => {
  const byHand = (one: PlanCheckIssue) => stopHref(TRIP, days, one);

  it('opens the stop where the fix is a screen of the crew’s plan', () => {
    expect(fixActionOf(issue({}), TRIP, byHand)).toEqual({
      kind: 'by_hand',
      href: `/${TRIP}/day/3?item=${WALK}`,
    });
  });

  it('keeps the one-tap fix and the too-far swap, which go to her draft', () => {
    const oneTap = issue({ fix: { kind: 'apply', ops: [] } as PlanCheckIssue['fix'] });
    expect(fixActionOf(oneTap, TRIP, byHand).kind).toBe('apply');
    const far = issue({ fix: { kind: 'screen', screen: 'too_far' } as PlanCheckIssue['fix'] });
    expect(fixActionOf(far, TRIP, byHand).kind).toBe('too_far');
  });

  it('opens the day for an issue about the whole day, and nothing for a day it does not have', () => {
    expect(fixActionOf(issue({ stable_ids: [] }), TRIP, byHand)).toEqual({
      kind: 'by_hand',
      href: `/${TRIP}/day/3`,
    });
    expect(fixActionOf(issue({ day_id: null }), TRIP, byHand)).toEqual({ kind: 'none' });
  });

  it('offers the fix as before on the crew’s plan', () => {
    expect(fixActionOf(issue({}), TRIP).kind).toBe('screen');
  });
});
