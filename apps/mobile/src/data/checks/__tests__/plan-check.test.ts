/**
 * The plan check's issues read from their synced rows (JSON text columns) into the domain's issue
 * shape; an issue of a kind this app doesn't know yet is left out instead of breaking the list.
 * And the check of an organiser's own draft: its counts are its own issues', it waits for its run
 * only while it has stops and no stamp, and an empty plan has nothing to check.
 */
import { describe, expect, it } from '@jest/globals';

import { draftCheckRow, isChecking, issuesFrom, type IssueRow } from '../use-plan-check';

const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const WALK = '0192f000-0000-7000-8000-0000000000e1';

const row = (id: string, kind: string, params: object): IssueRow => ({
  id,
  trip_id: TRIP,
  version_id: V1,
  kind,
  severity: 'fix',
  day_id: null,
  stable_ids: JSON.stringify([WALK]),
  params: JSON.stringify(params),
  fix: JSON.stringify({ kind: 'screen', screen: 'rain_crowds' }),
  rank: 0,
  fingerprint: `${kind}:${id}`,
});

describe('issuesFrom', () => {
  it('reads known issues and leaves out a kind from a newer server', () => {
    const issues = issuesFrom([
      row('0192f000-0000-7000-8000-00000000a001', 'rain', {
        stable_id: WALK,
        from: '13:00',
        to: '15:00',
        pct: 70,
        source: 'forecast',
      }),
      row('0192f000-0000-7000-8000-00000000a002', 'volcano', { ash: true }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'rain',
      params: { from: '13:00', to: '15:00', pct: 70 },
      stable_ids: [WALK],
      fix: { kind: 'screen', screen: 'rain_crowds' },
    });
  });
});

describe('draftCheckRow', () => {
  const issues = [{ severity: 'fix' }, { severity: 'know' }, { severity: 'know' }] as const;

  it("counts the draft's own issues once its run is stamped", () => {
    const check = draftCheckRow(TRIP, V1, { checked_at: '2026-10-05T01:00:00Z', stops: 4 }, issues);
    expect(check).toMatchObject({ version_id: V1, status: 'done', fix_count: 1, know_count: 2 });
    expect(isChecking(check)).toBe(false);
  });

  it('waits for the run while the draft has stops and no stamp', () => {
    expect(isChecking(draftCheckRow(TRIP, V1, { checked_at: null, stops: 2 }, []))).toBe(true);
  });

  it('has nothing to check on an empty plan', () => {
    const check = draftCheckRow(TRIP, V1, { checked_at: null, stops: 0 }, []);
    expect(check).toMatchObject({ status: 'done', fix_count: 0, know_count: 0 });
  });
});
