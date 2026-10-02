import { describe, expect, it } from 'vitest';

import { buildSosSummaryRequest, validateSosSummary } from '../src/routes/sos';

const input = {
  senderName: 'Priya',
  locale: 'en',
  preset: 'fell' as const,
  text: null,
  placeLabel: null,
};

describe('SOS summary', () => {
  it('gives the model no place when there is none, and a plain "fell"', () => {
    const request = JSON.stringify(buildSosSummaryRequest(input));
    expect(request).not.toMatch(/place: unknown/u);
    expect(request).toMatch(/situation: they fell\\n/u);
    expect(request).not.toMatch(/had a fall/u);
  });

  it('turns down a summary that talks about a place nobody gave', () => {
    for (const text of [
      'Priya fell on the trail; place is unknown.',
      'Priya fell. Location unknown.',
      'Priya fell, whereabouts not known.',
      'Priya bị ngã, không rõ địa điểm.',
    ]) {
      expect(validateSosSummary(text, input)).toEqual({ ok: false, reason: 'unknown_place' });
    }
    expect(validateSosSummary('Priya fell and twisted an ankle.', input).ok).toBe(true);
  });
});
