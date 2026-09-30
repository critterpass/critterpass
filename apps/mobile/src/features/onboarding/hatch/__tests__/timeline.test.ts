/**
 * The hatch timeline plays the design's keyframes: the egg's four wobbles and burst, Tokek landing,
 * the wordmark rising in; and each launch's plan keeps to its time budget.
 */
import { describe, expect, it } from '@jest/globals';

import {
  BEAT_PLAN,
  BURST_MS,
  EGG,
  HATCH_END_MS,
  HATCH_LOOP_MS,
  TOKEK,
  TOKEK_LANDED_MS,
  TOKEK_WIGGLE,
  WORDMARK,
  firstHatchPlan,
  sampleLoop,
  sampleTrack,
} from '../timeline';

const at = (fraction: number) => fraction * HATCH_LOOP_MS;

describe('hatch timeline', () => {
  it('starts on the launch screen: the egg upright and whole, nothing else showing', () => {
    expect(sampleTrack(EGG, 0)).toMatchObject({ r: 0, sx: 1, sy: 1, o: 1 });
    expect(sampleTrack(TOKEK, 0).o).toBe(0);
    expect(sampleTrack(WORDMARK, 0)).toMatchObject({ ty: 24, o: 0 });
  });

  it('wobbles the egg four times, then rights it before the burst', () => {
    expect([0.05, 0.1, 0.15, 0.2].map((f) => sampleTrack(EGG, at(f)).r)).toEqual([-9, 9, -12, 12]);
    expect(sampleTrack(EGG, BURST_MS)).toMatchObject({ r: 0, sx: 1.08, o: 1 });
    expect(sampleTrack(EGG, at(0.32))).toMatchObject({ sx: 1.4, o: 0 });
  });

  it('eases between stops rather than jumping', () => {
    const r = sampleTrack(EGG, at(0.075)).r;
    expect(r).toBeGreaterThan(-9);
    expect(r).toBeLessThan(9);
  });

  it('lands Tokek, then the wordmark, by the end of the hatch', () => {
    expect(sampleTrack(TOKEK, TOKEK_LANDED_MS)).toMatchObject({ sx: 1, o: 1 });
    expect(sampleTrack(WORDMARK, TOKEK_LANDED_MS).o).toBe(0);
    expect(sampleTrack(WORDMARK, HATCH_END_MS)).toMatchObject({ ty: 0, o: 1 });
  });

  it('waves Tokek on a 1400 ms loop', () => {
    expect(sampleLoop(TOKEK_WIGGLE, 1400, 0).r).toBe(-4);
    expect(sampleLoop(TOKEK_WIGGLE, 1400, 700).r).toBe(4);
    expect(sampleLoop(TOKEK_WIGGLE, 1400, 1400).r).toBe(-4);
  });
});

describe('hatch plans', () => {
  it('keeps the later-launch beat within 700 ms, fade included', () => {
    expect(BEAT_PLAN.playMs + BEAT_PLAN.holdMs + BEAT_PLAN.fadeMs).toBeLessThanOrEqual(700);
    expect(BEAT_PLAN.from).toBe(BURST_MS);
    expect(BEAT_PLAN.to).toBe(TOKEK_LANDED_MS);
  });

  it('plays the whole first hatch in real time on iOS, from the burst on Android', () => {
    expect(firstHatchPlan('ios')).toMatchObject({ from: 0, to: HATCH_END_MS, playMs: 2600 });
    expect(firstHatchPlan('android')).toMatchObject({ from: BURST_MS, playMs: 2600 - BURST_MS });
  });
});
