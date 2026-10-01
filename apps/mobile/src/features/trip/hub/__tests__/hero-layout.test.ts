import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import {
  baselineLift,
  countdownBeside,
  MEDIA_WINDOW,
  scrimStops,
  textInLayerZones,
} from '../hero-layout';

const LINE = { label: 'WHEELS UP IN', value: '17D 05:26:29' };
/** iPhone 15 and a 360 dp Android, inside the gutters. */
const IPHONE = 390 - tokens.size.gutter * 2;
const ANDROID = 360 - tokens.size.gutter * 2;

describe('hub header layout', () => {
  it('keeps the countdown beside a short name, as the design draws it', () => {
    expect(countdownBeside({ title: 'BALI', ...LINE, width: IPHONE })).toBe(true);
    expect(countdownBeside({ title: 'BALI', ...LINE, width: ANDROID })).toBe(true);
  });

  it('gives a long name the whole line and sets the countdown under it', () => {
    for (const title of ['MEXICO CITY', 'HỒ CHÍ MINH', 'ĐÀ NẴNG']) {
      expect({ title, beside: countdownBeside({ title, ...LINE, width: IPHONE }) }).toEqual({
        title,
        beside: false,
      });
    }
  });

  it("lifts the countdown onto the destination's baseline", () => {
    // Display leading (.82) puts a 90 pt baseline 6.8 pt above its box; a 22 pt countdown's is
    // 3.7 pt above its own.
    const lift = baselineLift({ titleSize: 90, titleLeading: 0.82, valueSize: 22 });
    expect(lift).toBeCloseTo(3.19, 1);
    // A looser line (Vietnamese marks) carries its baseline higher still.
    expect(baselineLift({ titleSize: 90, titleLeading: 1, valueSize: 22 })).toBeGreaterThan(lift);
  });

  it('drops the countdown under the name at larger text sizes', () => {
    expect(countdownBeside({ title: 'BALI', ...LINE, width: ANDROID, fontScale: 2 })).toBe(false);
  });
});

describe('hub header over media', () => {
  it('keeps the photo clear down to the middle of the destination, then ends in solid ink', () => {
    const stops = scrimStops({ height: 260, titleY: 160 });
    expect(stops.alphas).toEqual([0, 0, 1]);
    expect(stops.positions[1]).toBeCloseTo(210 / 260, 5);
    // Before the header is measured the stops still rise in order.
    expect(scrimStops({ height: 0, titleY: 0 }).positions).toEqual([0, 0, 1]);
  });

  it("sets the dates line and the destination inside the media layer's own ink", () => {
    const row = tokens.space['8'];
    // Top inset, the dates line (16) or the switch pill (44), the photo's window, then the name
    // on one line at its smallest or on two at its largest.
    for (const inset of [24, 47, 59]) {
      for (const top of [16, 44]) {
        for (const title of [63, 180]) {
          const labelY = inset + row;
          const titleY = labelY + top + MEDIA_WINDOW;
          const height = titleY + title + tokens.space['24'];
          expect({ inset, top, title, ok: textInLayerZones({ height, labelY, titleY }) }).toEqual({
            inset,
            top,
            title,
            ok: true,
          });
        }
      }
    }
  });
});
