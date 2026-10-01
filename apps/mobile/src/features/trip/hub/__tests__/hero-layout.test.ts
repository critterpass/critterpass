import { describe, expect, it } from '@jest/globals';

import { contrastRatio, tokens } from '@cp/design-tokens';

import { mixColour } from '@/ui/media/duotone';

import { countdownBeside, heroScrim, scrimStops } from '../hero-layout';

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

  it('drops the countdown under the name at larger text sizes', () => {
    expect(countdownBeside({ title: 'BALI', ...LINE, width: ANDROID, fontScale: 2 })).toBe(false);
  });
});

describe('hub header scrim', () => {
  const ink = tokens.color.ink['850'];
  const cream = tokens.color.paper.base;
  const guides = Object.entries(tokens.guide).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  it('keeps labels at 4.5:1 and the destination at 3:1 on the brightest a photo or loop gets', () => {
    expect(guides.length).toBeGreaterThan(5);
    for (const [guide, accent] of guides) {
      for (const loops of [false, true]) {
        const scrim = heroScrim(accent, loops);
        const brightest = loops ? tokens.color.paper.bright : mixColour(accent, ink, 0.2);
        const underLabel = mixColour(brightest, ink, scrim.label);
        const underTitle = mixColour(brightest, ink, scrim.title);
        expect({ guide, loops, ok: contrastRatio(cream, underLabel) >= 4.5 }).toEqual({
          guide,
          loops,
          ok: true,
        });
        expect({
          guide,
          loops,
          ok: contrastRatio(accent, underTitle) >= 3 && contrastRatio(cream, underTitle) >= 4.5,
        }).toEqual({ guide, loops, ok: true });
      }
    }
  });

  it('is clear at the top of the screen, deepens down the header and ends in solid ink', () => {
    const scrim = heroScrim(tokens.guide.tokek, false);
    const stops = scrimStops(scrim, { height: 200, labelY: 60, titleY: 110 });
    expect(stops.positions).toEqual([0, 0.3, 0.55, 1]);
    expect(stops.alphas[0]).toBe(0);
    expect(stops.alphas[3]).toBe(1);
    expect([...stops.alphas]).toEqual([...stops.alphas].sort((a, b) => a - b));
    // Before the header is measured the stops still rise in order.
    expect(scrimStops(scrim, { height: 0, labelY: 60, titleY: 0 }).positions).toEqual([0, 0, 0, 1]);
  });
});
