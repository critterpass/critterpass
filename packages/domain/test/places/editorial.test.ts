import { describe, expect, it } from 'vitest';

import { editorialOverlaySchema, localizedEditorial, readEditorialOverlay } from '../../src';

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

describe('a note in the reader’s language', () => {
  const editorial = readEditorialOverlay({
    why_go: 'A waterfall with an alpine coaster.',
    best_time: 'Morning',
    crowd_hint: 'Busy at weekends',
    time_needed_min: 150,
    must_see: true,
    i18n: {
      vi: { why_go: 'Thác nước có máng trượt.', best_time: 'Buổi sáng', unknown: 'dropped' },
      xx: { why_go: 'not a language the app ships' },
    },
  });

  it('takes each line in the reader’s language and the rest in English', () => {
    expect(localizedEditorial(editorial, 'vi')).toEqual({
      why_go: 'Thác nước có máng trượt.',
      best_time: 'Buổi sáng',
      crowd_hint: 'Busy at weekends',
      time_needed_min: 150,
      must_see: true,
    });
  });

  it('reads English for a language the note has not been written in, or one the app does not ship', () => {
    const english = {
      why_go: 'A waterfall with an alpine coaster.',
      best_time: 'Morning',
      crowd_hint: 'Busy at weekends',
      time_needed_min: 150,
      must_see: true,
    };
    expect(localizedEditorial(editorial, 'ja')).toEqual(english);
    expect(localizedEditorial(editorial, 'xx')).toEqual(english);
    expect(localizedEditorial(editorial, 'en')).toEqual(english);
  });

  it('reads English from a note with no translations', () => {
    expect(localizedEditorial(readEditorialOverlay({ why_go: 'A lake.' }), 'vi')).toEqual({
      why_go: 'A lake.',
    });
  });
});
