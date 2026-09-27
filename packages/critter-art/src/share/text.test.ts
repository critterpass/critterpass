import { describe, expect, it } from 'vitest';

import { ellipsize, graphemes, wrapLines } from './text';

// A fixed-width measurer (1 unit per character) makes wrap decisions deterministic and easy to assert on.
const measureChars = (s: string): number => s.length;

describe('graphemes', () => {
  it('splits plain ASCII into individual characters', () => {
    expect(graphemes('abc')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a multi-codepoint emoji (ZWJ family) as one grapheme', () => {
    const family = '👨‍👩‍👧'; // man + ZWJ + woman + ZWJ + girl
    const result = graphemes(`hi ${family}`);
    expect(result.at(-1)).toBe(family);
  });

  it('keeps a Vietnamese combining-diacritic sequence as one grapheme', () => {
    const chuNom = 'ạ'; // "a" + combining dot below (NFD form of "ạ")
    expect(graphemes(chuNom)).toEqual([chuNom]);
  });
});

describe('ellipsize', () => {
  it('returns the value unchanged when it already fits', () => {
    expect(ellipsize('short', 10, measureChars)).toBe('short');
  });

  it('truncates and appends an ellipsis when it does not fit', () => {
    expect(ellipsize('a longer caption', 8, measureChars)).toBe('a longe…');
  });

  it('never cuts a grapheme cluster in half', () => {
    const family = '👨‍👩‍👧';
    // The family emoji measures as many "characters" under a naive .length-based measurer, so a
    // width just short of the whole string forces a truncation boundary right at the cluster.
    const value = `hi ${family}`;
    const result = ellipsize(value, value.length - 1, measureChars);
    expect(result.endsWith('…')).toBe(true);
    // Whatever graphemes survive must be whole ones, never half a surrogate pair.
    expect(graphemes(result.slice(0, -1)).join('')).toBe(result.slice(0, -1));
  });
});

describe('wrapLines', () => {
  it('wraps on word boundaries within maxWidth', () => {
    expect(wrapLines('one two three four', measureChars, { maxWidth: 9 })).toEqual([
      'one two',
      'three',
      'four',
    ]);
  });

  it('keeps everything on one line when it fits', () => {
    expect(wrapLines('short caption', measureChars, { maxWidth: 50 })).toEqual(['short caption']);
  });

  it('ellipsizes the last line when the text overflows maxLines', () => {
    const lines = wrapLines('one two three four five six', measureChars, {
      maxWidth: 9,
      maxLines: 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('one two');
    expect(lines[1]?.endsWith('…')).toBe(true);
  });
});
