import { describe, expect, it } from 'vitest';

import { checkScreen } from './screen-checks';
import { premiumGrounds } from './screen-scan';
import { findGrabber, findSheetTopGap } from './screen-sheet-checks';
import { BG, blank, load, paint } from './screen-test-images';

const grounds = premiumGrounds();
const gap = (name: string) => findSheetTopGap(load(name), grounds);

describe('SHEET_TOP_GAP', { timeout: 60_000 }, () => {
  it('finds the band the top safe area left inside the pitch, invite and guide chat sheets', () => {
    for (const name of ['sheet-gap-pitch', 'sheet-gap-invite', 'sheet-gap-guide-chat'])
      expect({ name, code: gap(name)?.code }).toEqual({ name, code: 'SHEET_TOP_GAP' });
    expect(gap('sheet-gap-pitch')?.detail).toContain('under its grabber');
    expect(gap('sheet-gap-guide-chat')?.detail).toContain('under its top edge');
  });

  it('finds a sheet that opened with nothing but its button', () => {
    expect(gap('sheet-empty-pick-day')?.detail).toMatch(
      /empty for \d+px \(5\d\.\d% of the screen\)/,
    );
  });

  it('passes sheets whose header sits under the grabber, and screens with no sheet', () => {
    for (const name of [
      'day-sheet-over-map',
      'inset-sheet-over-dimmed-keyboard',
      'pitch-search-keyboard',
      'vote-showdown-half',
      'empty-vote-showdown',
      'home-board',
      'inbox',
    ])
      expect({ name, gap: gap(name) }).toEqual({ name, gap: null });
    expect(findGrabber(load('day-sheet-over-map'))).not.toBeNull();
  });

  it('runs with the other screen checks', () => {
    const codes = checkScreen(load('sheet-gap-invite'), {
      background: BG,
      premiumGrounds: grounds,
    }).map((f) => f.code);
    expect(codes).toEqual(['SHEET_TOP_GAP']);
  });

  it('takes a circle rim for no grabber', () => {
    const image = blank(400, 860, [0xf5, 0xf5, 0xf7]);
    // A dark disc whose foot is a short flat run, as a send target's circle reads at its bottom.
    for (let y = 300; y < 340; y += 1) {
      const half = Math.sqrt(Math.max(0, 400 - (y - 320) ** 2));
      paint(image, 200 - half, y, 200 + half, y + 1, [40, 40, 40]);
    }
    expect(findGrabber(image)).toBeNull();
  });
});
