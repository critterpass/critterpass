import { describe, expect, it } from 'vitest';

import { editorialOverlaySchema, readEditorialOverlay } from '../../src';

describe('reading a stored place note', () => {
  const note = { why_go: 'A holy spring temple.', best_time: 'Early morning', must_see: true };

  it('counts a line stored as null as absent', () => {
    expect(readEditorialOverlay({ ...note, etiquette: null, tips: null })).toEqual(note);
    // The strict schema, which console writes go through, still refuses it.
    expect(editorialOverlaySchema.safeParse({ ...note, etiquette: null }).success).toBe(false);
  });

  it('ignores a key this version does not know', () => {
    expect(readEditorialOverlay({ ...note, a_later_flag: true })).toEqual(note);
    expect(editorialOverlaySchema.safeParse({ ...note, a_later_flag: true }).success).toBe(false);
  });

  it('reads a missing note as empty', () => {
    expect(readEditorialOverlay(null)).toEqual({});
    expect(readEditorialOverlay({})).toEqual({});
  });

  it('still fails on a known line of the wrong type, or a note that is no object', () => {
    expect(() => readEditorialOverlay({ ...note, must_see: 'yes' })).toThrow();
    expect(() => readEditorialOverlay({ ...note, time_needed_min: '90' })).toThrow();
    expect(() => readEditorialOverlay(['why_go'])).toThrow();
    expect(() => readEditorialOverlay('A holy spring temple.')).toThrow();
  });
});
