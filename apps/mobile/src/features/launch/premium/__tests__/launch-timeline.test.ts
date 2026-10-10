/**
 * The launch geometry the welcome screen hands off from, and the stamp's localised date.
 */
import { describe, expect, it } from '@jest/globals';

import {
  BEATS,
  STICKERS,
  beatAt,
  launchCoverFinalFrame,
  stampDateLabel,
  stickerOrigin,
} from '../launch-timeline';

describe('launch timeline', () => {
  it('starts 200 ms before the stamp drops and keeps every beat after that', () => {
    expect(beatAt('stampDrop')).toBe(200);
    for (const beat of Object.keys(BEATS) as (keyof typeof BEATS)[]) {
      expect(beatAt(beat)).toBeGreaterThanOrEqual(200);
    }
    expect(beatAt('stampHit')).toBeLessThan(beatAt('lift'));
    expect(beatAt('settled')).toBeGreaterThan(beatAt('puffin'));
  });

  it('rests the cover 176 pt above the screen centre at .72 scale, turned -5°', () => {
    expect(launchCoverFinalFrame({ width: 390, height: 844 })).toEqual({
      centerX: 195,
      centerY: 246,
      width: 144,
      height: 188.64,
      rotate: -5,
    });
    expect(launchCoverFinalFrame({ width: 440, height: 956 }).centerY).toBe(302);
  });

  it('places the stickers where the design phone draws them, relative to the centre', () => {
    const tokek = STICKERS.find((sticker) => sticker.name === 'tokek');
    if (!tokek) throw new Error('no tokek');
    expect(stickerOrigin(tokek, { width: 390, height: 844 })).toEqual({ x: 232, y: 250 });
    expect(stickerOrigin(tokek, { width: 440, height: 956 })).toEqual({ x: 257, y: 306 });
  });

  it('writes the issue date upper-cased in the app language', () => {
    const day = new Date(2026, 9, 10, 12);
    expect(stampDateLabel(day, 'en-GB')).toBe('10 OCT 2026');
    expect(stampDateLabel(day, 'en-US')).toBe('OCT 10 2026');
    expect(stampDateLabel(day, 'vi')).toMatch(/^10 .*2026$/);
  });
});
