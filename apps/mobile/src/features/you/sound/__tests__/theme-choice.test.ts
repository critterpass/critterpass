/**
 * The theme that plays: the guide's own unless a card pinned another, and a pin on a theme the
 * release no longer ships falls back to following the guide rather than playing nothing.
 */
import { describe, expect, it } from '@jest/globals';

import { choiceOf, themeToPlay } from '../theme-choice';

describe('theme choice', () => {
  it('follows the guide until a theme is pinned', () => {
    expect(themeToPlay(choiceOf(undefined), 'pon')).toBe('pon');
    expect(themeToPlay(choiceOf('lundi'), 'pon')).toBe('lundi');
    expect(themeToPlay(choiceOf(undefined), undefined)).toBeUndefined();
  });

  it('follows the guide again when the pinned theme cannot play', () => {
    expect(choiceOf('no-such-guide')).toEqual({ mode: 'follow' });
    expect(choiceOf('')).toEqual({ mode: 'follow' });
    expect(themeToPlay(choiceOf('no-such-guide'), 'tokek')).toBe('tokek');
  });
});
