import { describe, expect, it } from '@jest/globals';

import {
  EMPTY_PITCH,
  applyPitchFrame,
  pitchShowsAiLabel,
  type PitchState,
} from '../../data/use-pitch-stream';

const frames = (...list: { type: string; data: Record<string, unknown> }[]): PitchState =>
  list.reduce(applyPitchFrame, { ...EMPTY_PITCH, phase: 'streaming' });

const HEADLINE = { type: 'headline', data: { text: 'Kyoto, slowly' } };
const done = (aiGenerated: unknown) => ({
  type: 'done',
  data: { pitch_id: 'p1', cached: false, ai_generated: aiGenerated },
});

describe('the pitch card says its words are AI-written', () => {
  it('not before any words show', () => {
    expect(pitchShowsAiLabel(frames())).toBe(false);
    expect(pitchShowsAiLabel(frames({ type: 'chip', data: { kind: 'prices_pending' } }))).toBe(
      false,
    );
  });

  it('as soon as words stream in, before the server has said who wrote them', () => {
    expect(pitchShowsAiLabel(frames(HEADLINE))).toBe(true);
    expect(pitchShowsAiLabel(frames({ type: 'quote', data: { text: 'Go in April.' } }))).toBe(true);
  });

  it('once the server confirms a model wrote it, or says nothing', () => {
    expect(pitchShowsAiLabel(frames(HEADLINE, done(true)))).toBe(true);
    expect(pitchShowsAiLabel(frames(HEADLINE, done(undefined)))).toBe(true);
  });

  it('not on a pitch the server put together without a model', () => {
    expect(pitchShowsAiLabel(frames(HEADLINE, done(false)))).toBe(false);
  });
});
