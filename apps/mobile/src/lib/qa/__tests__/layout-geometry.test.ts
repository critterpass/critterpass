import { describe, expect, it } from '@jest/globals';

import type { QaRect } from '../header-overlap';
import { alignmentProblems } from '../layout-alignment';
import {
  comparable,
  layoutProblems,
  type PlacedControl,
  type PlacedGround,
  type PlacedLayer,
  type PlacedText,
} from '../layout-geometry';
import { inkOf, type QaLine } from '../layout-rects';

const window = { width: 393, height: 852 };
const at = (x: number, y: number, width: number, height: number): QaRect => ({
  x,
  y,
  width,
  height,
});
const content: PlacedLayer = { id: 'content', atRest: true };
const scrolled: PlacedLayer = { id: 'content', atRest: false };

// Drawing order follows the order a test makes its boxes in, as React draws siblings.
let painted = 0;
function text(
  label: string,
  rect: QaRect,
  extra: Partial<PlacedText> & { lines?: QaLine[] } = {},
): PlacedText {
  painted += 1;
  const { lines, ...rest } = extra;
  return {
    label,
    rect,
    ink: inkOf(rect, lines),
    screen: 'trip',
    layer: null,
    free: false,
    paint: painted,
    grounds: [],
    controls: [],
    ...rest,
  };
}
function control(key: string, rect: QaRect, extra: Partial<PlacedControl> = {}): PlacedControl {
  painted += 1;
  return {
    key,
    label: key,
    rect,
    screen: 'trip',
    layer: null,
    free: false,
    paint: painted,
    grounds: [],
    ...extra,
  };
}
function ground(key: string, rect: QaRect): PlacedGround {
  painted += 1;
  return { key, paint: painted, rect };
}
const codes = (input: Parameters<typeof layoutProblems>[0]) =>
  layoutProblems(input).map((p) => `${p.code} ${p.subject}`);

describe('screen-wide layout checks', () => {
  it('passes a column of texts that only touch, and a label inside its own button', () => {
    const texts = [
      // A field's caption over its value share only their leading.
      text('"GIVEN NAME · PRÉNOM"', at(120, 79, 250, 23), { screen: 'pass' }),
      text('"Winston Bart"', at(120, 98, 125, 33), { screen: 'pass' }),
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
      text('"Day # · Lakes and markets"', at(36, 426, 160, 18)),
    ];
    expect(codes({ texts, controls: [], window })).toEqual([
      'TEXT_OVERLAP trip: "Day # · Old Quarter evening…" overlaps "Day # · Lakes and markets"',
    ]);
  });

  it('reports the trip eyebrow drawn under the back button, not the title beside it', () => {
    const texts = [
      text('trip-hub-eyebrow', at(26, 108, 140, 18), { layer: content }),
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
      text('pitch-written-by-ai', at(42, 668, 100, 20), { card, clip: card }),
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
        detail: expect.stringContaining('bottom 3pt'),
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

  it('judges a title by where its words draw, not by the box that stretches the row', () => {
    const title = text('home-screen "Home"', at(44, 58, 323, 46), {
      lines: [{ x: 0, y: 0, width: 120, height: 46 }],
    });
    const bell = control('home-bell', at(296, 56, 44, 44));
    expect(codes({ texts: [title], controls: [bell], window })).toEqual([]);
    const long = text('home-screen "Flying Dragon Supper"', at(44, 58, 323, 46), {
      lines: [{ x: 0, y: 0, width: 280, height: 46 }],
    });
    expect(codes({ texts: [long], controls: [bell], window })).toEqual([
      'TEXT_OVER_CONTROL trip: home-screen "Flying Dragon Supper" under home-bell',
    ]);
  });

  it('leaves what a later surface covers: the card behind in a deck, the page under a sheet', () => {
    const page = ground('page', at(0, 0, 393, 852));
    const behind = text('"Mount Agung"', at(59, 695, 293, 33), { grounds: [page] });
    const topCard = ground('top-card', at(40, 420, 330, 340));
    const top = text('"Ulun Danu Batur Temple"', at(48, 694, 315, 35), {
      grounds: [page, topCard],
    });
    const footer = text('"Pitch to the crew"', at(64, 815, 126, 23), { grounds: [page] });
    const sheet = ground('sheet', at(8, 450, 377, 402));
    const notNow = control('solo-cancel', at(30, 805, 57, 44), { grounds: [page, sheet] });
    expect(codes({ texts: [behind, top, footer], controls: [notNow], window })).toEqual([]);
    // The same deck with the top card drawn first: its title shows through the one above it.
    const early = text('"Ulun Danu Batur Temple"', at(48, 694, 315, 35), { grounds: [page] });
    const late = text('"Mount Agung"', at(59, 695, 293, 33), { grounds: [page] });
    expect(codes({ texts: [early, late], controls: [], window })).toHaveLength(1);
  });

  it('reports a text button set at the left edge under a centred primary button', () => {
    const sheet = ground('page', at(0, 0, 393, 852));
    const primary = control('draft-later', at(24, 736, 345, 58), { grounds: [sheet] });
    const primaryLabel = text('"Come back later"', at(120, 755, 153, 22), {
      controls: ['draft-later'],
      grounds: [sheet],
    });
    const cancel = control('draft-cancel', at(24, 806, 345, 30), { grounds: [sheet] });
    const cancelLabel = text('"Cancel the draft"', at(24, 810, 115, 20), {
      controls: ['draft-cancel'],
      grounds: [sheet],
    });
    const input = {
      texts: [primaryLabel, cancelLabel],
      controls: [primary, cancel],
      window,
    };
    expect(alignmentProblems(input).map((p) => p.subject)).toEqual([
      'trip: draft-cancel off the centre of draft-later',
    ]);
    const centred = text('"Cancel the draft"', at(139, 810, 115, 20), {
      controls: ['draft-cancel'],
      grounds: [sheet],
    });
    expect(alignmentProblems({ ...input, texts: [primaryLabel, centred] })).toEqual([]);
    // A list row under the button sits on its own card: not the button's pair.
    const card = ground('card', at(16, 806, 361, 60));
    const row = control('row', at(16, 806, 361, 60), { grounds: [sheet, card] });
    const rowTitle = text('"Mỹ Khê Beach"', at(32, 816, 100, 20), {
      controls: ['row'],
      grounds: [sheet, card],
    });
    expect(
      alignmentProblems({ texts: [primaryLabel, rowTitle], controls: [primary, row], window }),
    ).toEqual([]);
    // A code pill under the button draws its own glass: its label starts where the pill puts it.
    const pill = control('join-code', at(24, 806, 345, 52), { grounds: [sheet] });
    const pillLabel = text('"Join with a crew code"', at(44, 822, 150, 20), {
      controls: ['join-code'],
      grounds: [sheet],
      card: { label: 'GlassSurface', rect: at(24, 806, 345, 52) },
    });
    expect(
      alignmentProblems({ texts: [primaryLabel, pillLabel], controls: [primary, pill], window }),
    ).toEqual([]);
  });

  it('reports a guide note whose words were squeezed into a narrow column by a wide action', () => {
    const card = { label: 'bookings-guide-note', rect: at(22, 407, 371, 104) };
    const line = (y: number) => ({ x: 0, y, width: 96, height: 18 });
    const squeezed = text('"I can also check your inbox…"', at(78, 416, 100, 90), {
      card,
      lineCount: 5,
      lines: [line(0), line(18), line(36), line(54), line(72)],
    });
    const roomy = text('"Anyone with the code can join…"', at(78, 576, 290, 36), {
      card: { label: 'invite-note', rect: at(22, 568, 371, 54) },
      lineCount: 2,
    });
    expect(codes({ texts: [squeezed, roomy], controls: [], window })).toEqual([
      'TEXT_SQUEEZED trip: "I can also check your inbox…" in a narrow column on bookings-guide-note',
    ]);
  });

  it('judges a rolling number by its window, and a stack of cards by the card on top', () => {
    const window1 = { label: 'money-hero-amount', rect: at(79, 61, 38, 88) };
    const reel = text('money-hero-amount "# # # # # # # # # #"', at(79, -721, 38, 861), {
      clip: window1,
    });
    const settle = control('money-settle', at(20, 432, 251, 56));
    const sameNumber = text('money-hero-amount "₫"', at(40, 75, 41, 62));
    const bars = { label: 'money-bars', rect: at(20, 320, 371, 200) };
    const barReel = text('money-bar "# # # # # # # # # #"', at(322, 300, 8, 190), {
      clip: { label: 'money-bar', rect: at(322, 340, 8, 19) },
      card: bars,
      lineCount: 10,
    });
    expect(codes({ texts: [reel, sameNumber, barReel], controls: [settle], window })).toEqual([]);
    const nights = text('bookings-closed "# nights"', at(84, 263, 45, 12));
    const openCard = control('bookings-open-details', at(20, 272, 371, 249), { ownGround: true });
    expect(codes({ texts: [nights], controls: [openCard], window })).toEqual([]);
    // A button is no card: drawn before or after the text, the two collide.
    const before = control('glass-back', at(20, 68, 48, 48), { ownGround: true });
    const eyebrow = text('trip-hub-eyebrow', at(26, 108, 140, 18));
    const after = control('glass-back', at(20, 68, 48, 48), { ownGround: true });
    for (const back of [before, after])
      expect(codes({ texts: [eyebrow], controls: [back], window })).toEqual([
        'TEXT_OVER_CONTROL trip: trip-hub-eyebrow under glass-back',
      ]);
  });

  it('measures a sheet from its own top, and leaves a row of chips under a field alone', () => {
    const sheetTitle = text('guide-top-bar "Tokek"', at(114, 25, 56, 16), { presented: true });
    expect(codes({ texts: [sheetTitle], controls: [], window, topInset: 62 })).toEqual([]);
    const search = control('plan-map-search', at(68, 64, 266, 48));
    const searchWords = text('"Find anything"', at(130, 79, 142, 18), {
      controls: ['plan-map-search'],
    });
    const chips = ['food', 'museum', 'beach'].map((name, index) =>
      control(`chip-${name}`, at(100 + index * 80, 126, 70, 26)),
    );
    const chipWords = chips.map((chip, index) =>
      text(`"${String(index)}"`, at(chip.rect.x + 10, 133, 40, 11), { controls: [chip.key] }),
    );
    expect(
      alignmentProblems({
        texts: [searchWords, ...chipWords],
        controls: [search, ...chips],
        window,
      }),
    ).toEqual([]);
  });
});
