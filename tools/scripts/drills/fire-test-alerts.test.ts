import { describe, expect, it } from 'vitest';

import type { AlertRule } from '../grafana-config';
import { buildTestAlerts, checkRouting, drillRules, expectedState } from './fire-test-alerts';

const rule = (severity: 'P1' | 'P2', title: string): AlertRule => ({
  uid: `cp-${severity.toLowerCase()}-${title}`,
  title,
  severity,
  runbook: 'api-down',
  for: '1m',
  expr: 'up',
  op: 'lt',
  threshold: 1,
  noData: 'NoData',
  summary: title,
});

// 06:59, 07:00, 22:59 and 23:00 in Singapore (UTC+8).
const at = (utc: string) => new Date(`2026-10-06T${utc}:00Z`);

describe('expectedState', () => {
  it('pages P1 only from 07:00 to 23:00 Singapore time', () => {
    expect(expectedState('P1', at('22:59'))).toBe('suppressed');
    expect(expectedState('P1', at('23:00'))).toBe('active');
    expect(expectedState('P1', at('14:59'))).toBe('active');
    expect(expectedState('P1', at('15:00'))).toBe('suppressed');
  });

  it('never mutes P2', () => {
    expect(expectedState('P2', at('18:00'))).toBe('active');
  });
});

describe('checkRouting', () => {
  const rules = drillRules([rule('P2', 'b'), rule('P1', 'a'), rule('P2', 'c')]);
  const night = at('18:00');
  const sent = buildTestAlerts(rules, 'staging', night);

  it('drills every P1 and one P2', () => {
    expect(rules.map((r) => r.title)).toEqual(['a', 'b']);
  });

  it('accepts a P1 held back by the waking-hours mute at night', () => {
    const held = [
      {
        labels: { alertname: 'a' },
        status: { state: 'suppressed', mutedBy: ['outside-sgt-waking-hours'] },
      },
      { labels: { alertname: 'b' }, status: { state: 'active' } },
    ];
    expect(checkRouting(sent, held, night)).toEqual([]);
  });

  it('reports a P1 delivered at night and an alert Alertmanager never held', () => {
    const held = [{ labels: { alertname: 'a' }, status: { state: 'active' } }];
    expect(checkRouting(sent, held, night)).toEqual([
      'a: active, expected suppressed',
      'b: not held by Alertmanager',
    ]);
  });
});
