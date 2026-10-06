/**
 * The dwell the server confirms from reported samples: it fills only between samples the phone
 * sent, holds on a poor fix, drains on the server's clock once the traveller has left (after the
 * grace period, at a third of the fill speed) and empties to "wandered off".
 */
import { DEFAULT_ENCOUNTER_CONFIG } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { confirmedDwell, type DwellSample } from '../../src/jobs/la/critter-dwell';

const T0 = Date.parse('2026-10-06T09:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000);
const sample = (s: number, band: string, accuracy = 10): DwellSample => ({
  at: at(s),
  distance_band: band,
  accuracy_m: accuracy,
});
const every10 = (from: number, to: number, band: string) =>
  Array.from({ length: (to - from) / 10 + 1 }, (_, i) => sample(from + i * 10, band));

const dwell = (samples: readonly DwellSample[], nowS: number, target = 300) =>
  confirmedDwell(samples, target, at(nowS), DEFAULT_ENCOUNTER_CONFIG);

describe('confirmedDwell', () => {
  it('has nothing to vouch for before the first sample', () => {
    expect(dwell([], 120)).toMatchObject({ phase: 'idle', fraction: 0, lastSampleAt: null });
  });

  it('fills between reported samples and never past the last one', () => {
    const result = dwell(every10(0, 60, '10_25'), 600);
    expect(result.phase).toBe('accruing');
    expect(result.fraction).toBeCloseTo(60 / 300);
    expect(result.band).toBe('close');
    expect(result.lastSampleAt).toEqual(at(60));
  });

  it('does not count time around a fix too poor to trust', () => {
    const samples = [sample(0, '0_10'), sample(30, '0_10', 80), sample(60, '0_10')];
    // 0–30 s counts; the poor fix at 30 s stops the count until the good one at 60 s.
    expect(dwell(samples, 60).fraction).toBeCloseTo(30 / 300);
  });

  it('is ready once the stay reaches the target', () => {
    expect(dwell(every10(0, 300, '0_10'), 300)).toMatchObject({
      phase: 'ready',
      fraction: 1,
      band: 'here',
    });
  });

  it('holds through the grace period after leaving, then drains at a third of the fill', () => {
    const samples = [...every10(0, 120, '25_50'), sample(130, '50_plus')];
    expect(dwell(samples, 130 + 90)).toMatchObject({ phase: 'draining', band: 'near' });
    expect(dwell(samples, 130 + 90).fraction).toBeCloseTo(130 / 300);
    // 60 s past the grace period: 20 s of the ring gone.
    expect(dwell(samples, 130 + 90 + 60).fraction).toBeCloseTo(110 / 300);
  });

  it('fills again from where it was when the traveller comes back', () => {
    const samples = [
      ...every10(0, 120, '0_10'),
      sample(130, '50_plus'),
      sample(280, '0_10'),
      sample(310, '0_10'),
    ];
    // Left at 130 s with 130 s banked, drained (280 − 220) / 3 = 20 s, then 30 s more.
    const result = dwell(samples, 310);
    expect(result.phase).toBe('accruing');
    expect(result.fraction).toBeCloseTo(140 / 300);
  });

  it('empties to wandered off when the traveller stays away', () => {
    const samples = [...every10(0, 30, '0_10'), sample(40, '50_plus')];
    expect(dwell(samples, 40 + 90 + 121)).toMatchObject({ phase: 'wandered_off', fraction: 0 });
  });
});
