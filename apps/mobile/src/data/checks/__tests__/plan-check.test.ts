/**
 * The plan check's issues read from their synced rows (JSON text columns) into the domain's issue
 * shape; an issue of a kind this app doesn't know yet is left out instead of breaking the list.
 */
import { describe, expect, it } from '@jest/globals';

import { issuesFrom, type IssueRow } from '../use-plan-check';

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
