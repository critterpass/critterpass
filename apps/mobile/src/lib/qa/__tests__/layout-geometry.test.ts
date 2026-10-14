import { describe, expect, it } from '@jest/globals';

import type { QaRect } from '../header-overlap';
import {
  comparable,
  layoutProblems,
  type PlacedControl,
  type PlacedLayer,
  type PlacedText,
} from '../layout-geometry';

const window = { width: 393, height: 852 };
const at = (x: number, y: number, width: number, height: number): QaRect => ({
  x,
  y,
  width,
  height,
});
const content: PlacedLayer = { id: 'content', atRest: true };
const scrolled: PlacedLayer = { id: 'content', atRest: false };

function text(label: string, rect: QaRect, extra: Partial<PlacedText> = {}): PlacedText {
  return { label, rect, screen: 'trip', layer: null, free: false, controls: [], ...extra };
}
function control(key: string, rect: QaRect, extra: Partial<PlacedControl> = {}): PlacedControl {
  return { key, label: key, rect, screen: 'trip', layer: null, free: false, ...extra };
}
const codes = (input: Parameters<typeof layoutProblems>[0]) =>
  layoutProblems(input).map((p) => `${p.code} ${p.subject}`);

describe('screen-wide layout checks', () => {
  it('passes a column of texts that only touch, and a label inside its own button', () => {
    const texts = [
      text('"Hà Nội"', at(20, 140, 200, 60)),
      text('"Oct 23–29 · 1 going"', at(20, 201, 180, 18)),
      text('"Lock Oct 28 – Nov 3"', at(120, 760, 150, 22), { controls: ['lock'] }),
    ];
    const controls = [control('lock', at(24, 742, 345, 58))];
    expect(codes({ texts, controls, window })).toEqual([]);
  });

  it('reports day tags piled on each other', () => {
    const texts = [
      text('"Day # · Old Quarter evening…"', at(36, 418, 200, 18)),
      text('"Day # · Lakes and markets"', at(36, 432, 160, 18)),
    ];
    expect(codes({ texts, controls: [], window })).toEqual([
      'TEXT_OVERLAP trip: "Day # · Old Quarter evening…" overlaps "Day # · Lakes and markets"',
    ]);
  });

  it('reports the trip eyebrow drawn under the back button, not the title beside it', () => {
    const texts = [
      text('trip-hub-eyebrow', at(26, 112, 140, 18), { layer: content }),
      text('"Hà Nội"', at(24, 136, 190, 64), { layer: content }),
    ];
    const controls = [control('glass-back', at(20, 68, 48, 48))];
    expect(codes({ texts, controls, window })).toEqual([
      'TEXT_OVER_CONTROL trip: trip-hub-eyebrow under glass-back',
    ]);
  });

  it('reports a row title running under its more button, but not a tap area over the whole row', () => {
    const texts = [
      text('"Hemisphere\'s Steak and Se…"', at(140, 540, 230, 22), { controls: ['row'] }),
    ];
    const controls = [
      control('row', at(92, 520, 300, 60)),
      control('more', at(352, 530, 40, 40)),
      control('card-tap', at(20, 500, 360, 120)),
    ];
    expect(codes({ texts, controls, window })).toEqual([
      'TEXT_OVER_CONTROL trip: "Hemisphere\'s Steak and Se…" under more',
    ]);
  });

  it('lets content scroll under a floating header and sit under a footer', () => {
    const header = control('glass-back', at(20, 60, 48, 48));
    const footerCta = control('place-cta', at(18, 790, 310, 58));
    const under = text('"Hoan Kiem Lake"', at(22, 70, 240, 40), { layer: scrolled });
    const belowFooter = text('"Đền Ngọc Sơn"', at(30, 800, 140, 20), { layer: content });
    expect(codes({ texts: [under, belowFooter], controls: [header, footerCta], window })).toEqual(
      [],
    );
    expect(comparable(under, header, window)).toBe(false);
    expect(comparable({ ...under, layer: content }, header, window)).toBe(true);
  });

  it('never compares texts of different screens, map labels, or texts off the window', () => {
    const texts = [
      text('"Chiang Mai"', at(40, 300, 100, 20)),
      text('"Vancouver"', at(40, 305, 100, 20), { screen: 'vote' }),
      text('"1"', at(180, 140, 12, 14), { free: true }),
      text('"3"', at(184, 142, 12, 14), { free: true }),
      text('"Next"', at(400, 300, 100, 20)),
      text('"Later"', at(410, 300, 100, 20)),
    ];
    expect(codes({ texts, controls: [], window })).toEqual([]);
  });

  it('reports a pitch card that lost its padding: headline cut at the side, eyebrow at the edge', () => {
    const card = { label: 'pitch-card', rect: at(42, 264, 330, 418) };
    const texts = [
      text('pitch-eyebrow', at(130, 264, 120, 16), { card }),
      text('pitch-headline', at(130, 282, 260, 84), { card, clip: card }),
      text('pitch-written-by-ai', at(42, 664, 100, 20), { card, clip: card }),
      text('pitch-reason', at(42 + 16, 450, 260, 40), { card, clip: card }),
    ];
    expect(layoutProblems({ texts, controls: [], window })).toEqual([
      expect.objectContaining({
        code: 'TEXT_PAST_PADDING',
        subject: 'trip: pitch-eyebrow at the edge of pitch-card',
        detail: expect.stringContaining('room top 0pt'),
      }),
      expect.objectContaining({
        code: 'TEXT_CLIPPED',
        subject: 'trip: pitch-headline cut by pitch-card',
        detail: expect.stringContaining('right 18pt'),
      }),
      expect.objectContaining({
        code: 'TEXT_CLIPPED',
        subject: 'trip: pitch-written-by-ai cut by pitch-card',
        detail: expect.stringContaining('bottom 2pt'),
      }),
    ]);
  });

  it('leaves a text hidden whole by its clip (a rolling digit) and a tag label on a small pill', () => {
    const clip = { label: 'counter', rect: at(100, 100, 20, 24) };
    const pill = { label: 'price-tag', rect: at(40, 380, 130, 36) };
    const texts = [
      text('"9"', at(100, 124, 20, 24), { clip }),
      text('"Prices pending"', at(44, 386, 122, 22), { card: pill }),
    ];
    expect(codes({ texts, controls: [], window })).toEqual([]);
  });

  it('reports a page title pushed under the status bar, not content scrolled under it', () => {
    const title = text('drafting-title', at(30, 38, 330, 70));
    const scrolledTitle = text('"Hoan Kiem Lake"', at(22, 20, 240, 40), { layer: scrolled });
    const header = text('"Hà Nội setup"', at(150, 68, 110, 22), { screen: 'setup' });
    expect(
      codes({ texts: [title, scrolledTitle, header], controls: [], window, topInset: 59 }),
    ).toEqual(['TEXT_UNDER_STATUS_BAR trip: drafting-title']);
  });
});
