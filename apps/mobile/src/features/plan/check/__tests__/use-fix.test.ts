import { describe, expect, it } from '@jest/globals';
import type { PlanCheckIssue } from '@cp/domain';

import { cardsAfter, fixActionOf, fixOutcome } from '../use-fix';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP = id(1);
const DAY = id(2);

const issue = (fix: PlanCheckIssue['fix']): PlanCheckIssue => ({
  id: id(10),
  trip_id: TRIP,
  version_id: id(3),
  kind: 'clash',
  params: { first: id(20), second: id(21), short_minutes: 60 },
  severity: 'fix',
  day_id: DAY,
  stable_ids: [id(20), id(21)],
  fix,
  rank: 0,
  fingerprint: 'clash:1',
});

describe('what FIX does', () => {
  it('applies a one-tap fix, opens the too-far sheet, and sends the rest to their screens', () => {
    expect(fixActionOf(issue({ kind: 'apply', ops: [] }), TRIP)).toEqual({ kind: 'apply' });
    expect(fixActionOf(issue({ kind: 'screen', screen: 'too_far' }), TRIP)).toEqual({
      kind: 'too_far',
    });
    expect(fixActionOf(issue({ kind: 'screen', screen: 'less_driving' }), TRIP)).toEqual({
      kind: 'screen',
      href: `/${TRIP}/check/less-driving/${DAY}`,
    });
    expect(fixActionOf(issue({ kind: 'screen', screen: 'rain_crowds' }), TRIP)).toEqual({
      kind: 'screen',
      href: `/${TRIP}/check/rain/${DAY}`,
    });
    expect(fixActionOf(issue({ kind: 'none' }), TRIP)).toEqual({ kind: 'none' });
  });

  it('tells an organiser’s applied fix from a member’s change set', () => {
    expect(
      fixOutcome({
        kind: 'applied',
        opId: 'a',
        result: { applied: true, guide_action_id: id(30) },
      }),
    ).toEqual({ kind: 'applied', actionId: id(30) });
    expect(
      fixOutcome({ kind: 'applied', opId: 'b', result: { applied: false, change_set_id: id(31) } }),
    ).toEqual({ kind: 'sent', changeSetId: id(31) });
  });

  it('treats an issue the plan moved past as stale, and takes its card off', () => {
    const stale = fixOutcome({
      kind: 'rejected',
      opId: 'c',
      code: 'STATE_INVALID',
      detail: { reason: 'stale_issue' },
    });
    expect(stale).toEqual({ kind: 'stale' });
    expect([...cardsAfter(new Set(), id(10), stale)]).toEqual([id(10)]);
  });

  it('keeps the card when the real drive leaves no room for the move', () => {
    const unfit = fixOutcome({
      kind: 'rejected',
      opId: 'e',
      code: 'STATE_INVALID',
      detail: { reason: 'fix_would_clash' },
    });
    expect(unfit).toEqual({ kind: 'unfit' });
    expect(cardsAfter(new Set(), id(10), unfit).size).toBe(0);
  });

  it('keeps the card when the fix did not get through', () => {
    const failed = fixOutcome({ kind: 'unavailable', opId: 'd', code: 'NETWORK' });
    expect(failed).toEqual({ kind: 'failed' });
    expect(cardsAfter(new Set(), id(10), failed).size).toBe(0);
  });

  it('reads a fix on her own draft and the reasons it can be refused there', () => {
    expect(
      fixOutcome({ kind: 'applied', opId: 'f', result: { applied: true, version_id: id(40) } }),
    ).toEqual({ kind: 'applied', actionId: id(40) });
    const refused = (reason: string) =>
      fixOutcome({ kind: 'rejected', opId: 'g', code: 'STATE_INVALID', detail: { reason } });
    const working = refused('draft_running');
    expect(working).toEqual({ kind: 'guideWorking' });
    // The guide hands the draft back: the fix can be tried again, so the card stays.
    expect(cardsAfter(new Set(), id(10), working).size).toBe(0);
    const shared = refused('plan_shared');
    expect(shared).toEqual({ kind: 'shared' });
    expect([...cardsAfter(new Set(), id(10), shared)]).toEqual([id(10)]);
    expect(refused('trip_status')).toEqual({ kind: 'failed' });
  });
});
