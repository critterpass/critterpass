import { describe, expect, it } from 'vitest';

import { findFrame, type Rgb } from './screen-checks';
import { premiumGrounds } from './screen-scan';
import { BG, blank, busyScreen, copy, load, paint } from './screen-test-images';

describe('screen checks on the premium UI', { timeout: 60_000 }, () => {
  it('judges a premium screen by its own ground, and still finds a frame around it', () => {
    const grounds = premiumGrounds();
    expect(grounds).toEqual([
      [
        [0xf5, 0xf5, 0xf7],
        [0xff, 0xff, 0xff],
      ],
      [
        [0x0e, 0x0f, 0x13],
        [0x1c, 0x1d, 0x24],
      ],
    ]);
    const options = { background: BG, premiumGrounds: grounds };
    // The light screen framed by the current UI's ground; the dark one by black (the current
    // ground is within a shade of the dark card, so it reads as that card).
    const frames: Rgb[] = [BG, [0, 0, 0]];
    for (const [index, [ground, card]] of (grounds as [Rgb, Rgb][]).entries()) {
      // Cards set in by the 16 pt gutter (48 px on a 3x capture) on the premium ground.
      const screen = blank(400, 860, ground);
      for (let y = 90; y < 820; y += 70) paint(screen, 16, y, 384, y + 60, card);
      expect(findFrame(screen, options)).toBeNull();
      const framed = copy(screen);
      const frame = frames[index] ?? BG;
      paint(framed, 0, 0, 14, 860, frame);
      paint(framed, 386, 0, 400, 860, frame);
      expect(findFrame(framed, options)?.detail).toContain('14px');
    }
  });

  it('judges the current UI the same when the premium grounds are known', () => {
    const options = { background: BG, premiumGrounds: premiumGrounds() };
    for (const name of [
      'inbox',
      'home-board',
      'vote-showdown-half',
      'pitch-search-keyboard',
      'frame-sheet-over-chat',
      'frame-join-code-keyboard',
    ]) {
      const image = load(name);
      expect({ name, code: findFrame(image, options)?.code }).toEqual({
        name,
        code: findFrame(image, { background: BG })?.code,
      });
    }
    const framed = busyScreen();
    paint(framed, 0, 0, 14, 860, [11, 10, 18]);
    paint(framed, 386, 0, 400, 860, [11, 10, 18]);
    expect(findFrame(framed, options)?.code).toBe('SCREEN_FRAME');
  });

  it('judges a premium page filled by cards by the ground down its sides', () => {
    const options = { background: BG, premiumGrounds: premiumGrounds() };
    const ground: Rgb = [0xf5, 0xf5, 0xf7];
    // The quiz: two big cards fill the middle, the ground shows only in the gutters.
    const quiz = blank(400, 860, ground);
    paint(quiz, 20, 100, 380, 470, [0xff, 0xd8, 0x4a]);
    paint(quiz, 20, 490, 380, 860, [0x4f, 0x86, 0xff]);
    expect(findFrame(quiz, options)).toBeNull();
    // The same cards on the current UI's ground inside a light band: still a frame.
    const framed = blank(400, 860, BG);
    paint(framed, 40, 100, 360, 470, [0xff, 0xd8, 0x4a]);
    paint(framed, 40, 490, 360, 860, [0x4f, 0x86, 0xff]);
    paint(framed, 0, 0, 14, 860, ground);
    paint(framed, 386, 0, 400, 860, ground);
    expect(findFrame(framed, options)?.code).toBe('SCREEN_FRAME');
  });

  it('leaves a light pass on the dark page, and still flags a dark band around the light page', () => {
    const options = { background: BG, premiumGrounds: premiumGrounds() };
    const [light, dark] = premiumGrounds();
    const darkPage = dark?.[0] ?? [0, 0, 0];
    const lightCard = light?.[0] ?? [255, 255, 255];
    // 7.10 in dark: the boarding pass is drawn light at the 20 pt gutters of the dark page.
    const pass = blank(400, 860, darkPage);
    paint(pass, 20, 20, 380, 800, lightCard);
    expect(findFrame(pass, options)).toBeNull();
    // A light premium page set inside a dark border that isn't a page ground stays a frame.
    const framed = blank(400, 860, lightCard);
    paint(framed, 0, 0, 20, 860, [40, 10, 10]);
    paint(framed, 380, 0, 400, 860, [40, 10, 10]);
    expect(findFrame(framed, options)?.code).toBe('SCREEN_FRAME');
  });

  it('allows an inset sheet over the dimmed page, and not the same inset from the top', () => {
    // The iOS 26 guide sheet, lifted by the keyboard, 8 pt in from the dimmed page.
    const options = { background: BG, premiumGrounds: premiumGrounds() };
    expect(findFrame(load('inset-sheet-over-dimmed-keyboard'), options)).toBeNull();
    const dimmed: Rgb = [190, 190, 192];
    const sheet = blank(400, 860, dimmed);
    paint(sheet, 24, 70, 200, 100, [120, 120, 124]);
    paint(sheet, 8, 160, 392, 860, [248, 248, 250]);
    for (let y = 200; y < 820; y += 24) paint(sheet, 30, y, 300, y + 12, [60, 60, 70]);
    expect(findFrame(sheet, options)).toBeNull();
    const framed = copy(sheet);
    paint(framed, 8, 0, 392, 160, [248, 248, 250]);
    expect(findFrame(framed, options)?.code).toBe('SCREEN_FRAME');
    // A tall sheet starts right under the status bar, at the top of the rows the check judges.
    const tall = blank(400, 860, dimmed);
    paint(tall, 24, 8, 120, 30, [120, 120, 124]);
    paint(tall, 8, 64, 392, 860, [248, 248, 250]);
    for (let y = 100; y < 820; y += 24) paint(tall, 30, y, 300, y + 12, [60, 60, 70]);
    expect(findFrame(tall, options)).toBeNull();
  });
  it('reads an action sheet scrim over a premium page as no frame, but not a frame on the page', () => {
    const options = { background: BG, premiumGrounds: premiumGrounds() };
    // A booking's action sheet: its scrim greys the page's 20 pt gutters and its cards alike.
    expect(findFrame(load('scrim-action-sheet-options'), options)).toBeNull();
    const dim = (colour: Rgb): Rgb => [
      Math.round(colour[0] * 0.8),
      Math.round(colour[1] * 0.8),
      Math.round(colour[2] * 0.8),
    ];
    const ground: Rgb = [0xf5, 0xf5, 0xf7];
    const card: Rgb = [0xff, 0xff, 0xff];
    // The same grey frame around an undimmed page is still a frame.
    const framed = blank(400, 860, ground);
    for (let y = 90; y < 820; y += 70) paint(framed, 19, y, 381, y + 60, card);
    paint(framed, 0, 0, 19, 860, dim(ground));
    paint(framed, 381, 0, 400, 860, dim(ground));
    expect(findFrame(framed, options)?.code).toBe('SCREEN_FRAME');
  });
});
