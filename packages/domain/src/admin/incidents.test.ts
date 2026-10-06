import { describe, expect, it } from 'vitest';

import { maintenanceAllows, postIncidentPayloadSchema } from './incidents';
import { serviceStateAt, setVendorCostPayloadSchema } from './services-registry';

describe('maintenanceAllows', () => {
  const readOnly = [{ kind: 'maintenance' as const, read_only: true }];

  it('refuses console commands during a read-only window', () => {
    expect(maintenanceAllows('set_feature_flag', 'admin', readOnly)).toBe(false);
  });

  it('still lets ops update or resolve the banner, and never refuses the CLI', () => {
    expect(maintenanceAllows('resolve_incident', 'admin', readOnly)).toBe(true);
    expect(maintenanceAllows('update_incident', 'admin', readOnly)).toBe(true);
    expect(maintenanceAllows('set_feature_flag', 'cli', readOnly)).toBe(true);
  });

  it('ignores incidents and maintenance that is not read-only', () => {
    expect(
      maintenanceAllows('set_feature_flag', 'admin', [
        { kind: 'incident', read_only: false },
        { kind: 'maintenance', read_only: false },
      ]),
    ).toBe(true);
  });

  it('allows read-only only on maintenance', () => {
    expect(
      postIncidentPayloadSchema.safeParse({ kind: 'incident', text: 'x', read_only: true }).success,
    ).toBe(false);
    expect(
      postIncidentPayloadSchema.safeParse({ kind: 'maintenance', text: 'x', read_only: true })
        .success,
    ).toBe(true);
  });
});

describe('serviceStateAt', () => {
  const now = new Date('2026-10-06T08:00:00Z');

  it('is unknown without a snapshot or with a stale one, never the old value', () => {
    expect(serviceStateAt(null, now)).toBe('unknown');
    expect(serviceStateAt({ state: 'ok', at: new Date('2026-10-06T07:49:00Z') }, now)).toBe(
      'unknown',
    );
  });

  it('is the snapshot state while fresh', () => {
    expect(serviceStateAt({ state: 'degraded', at: new Date('2026-10-06T07:58:00Z') }, now)).toBe(
      'degraded',
    );
  });
});

describe('setVendorCostPayloadSchema', () => {
  it('takes a known service and a YYYY-MM month only', () => {
    const base = { month: '2026-10', amount_minor: 29_900, currency: 'USD' };
    expect(setVendorCostPayloadSchema.safeParse({ ...base, service: 'railway' }).success).toBe(
      true,
    );
    expect(setVendorCostPayloadSchema.safeParse({ ...base, service: 'nope' }).success).toBe(false);
    expect(
      setVendorCostPayloadSchema.safeParse({ ...base, service: 'railway', month: '2026-13' })
        .success,
    ).toBe(false);
  });
});
