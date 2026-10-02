import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodePng, type RgbaImage } from './png';
import {
  checkScreen,
  findEmptyScreen,
  findFrame,
  findKeyboardBand,
  keyboardTop,
  type Rgb,
} from './screen-checks';
import { appBackground, scanScreenshots } from './screen-scan';

// Founder device screenshots and one CI simulator capture (downscaled; reviewer marks painted out
// where they crossed an edge).
const FIXTURES = path.join(import.meta.dirname, '__fixtures__/screens');
const load = (name: string) => decodePng(readFileSync(path.join(FIXTURES, `${name}.png`)));
const BG = appBackground();
const codes = (image: RgbaImage) => checkScreen(image, { background: BG }).map((f) => f.code);

function blank(width: number, height: number, colour: Rgb): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...colour, 255], i * 4);
  return { width, height, data };
}

function paint(image: RgbaImage, x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
  for (let y = Math.round(y0); y < Math.round(y1); y += 1)
    for (let x = Math.round(x0); x < Math.round(x1); x += 1)
      image.data.set([...c], (y * image.width + x) * 4);
}

function copy(image: RgbaImage): RgbaImage {
  return { ...image, data: new Uint8Array(image.data) };
}

/** A synthetic screen: text-like lines down the whole height on the app background. */
function busyScreen(): RgbaImage {
  const image = blank(400, 860, BG);
  for (let y = 80; y < 820; y += 24) paint(image, 30, y, 300, y + 12, [240, 235, 220]);
  return image;
}

describe('screen checks', { timeout: 60_000 }, () => {
  it('reads the app background from the design tokens', () => {
    expect(BG).toEqual([0x17, 0x14, 0x2a]);
  });

  it('passes founder screens that are fine', () => {
    for (const name of ['inbox', 'home-board', 'vote-showdown-half', 'pitch-search-keyboard'])
      expect({ name, codes: codes(load(name)) }).toEqual({ name, codes: [] });
  });

  describe('SCREEN_FRAME', () => {
    it('finds the dark frame a sheet over chat was drawn in', () => {
      expect(findFrame(load('frame-sheet-over-chat'), { background: BG })?.code).toBe(
        'SCREEN_FRAME',
      );
    });

    it('finds the frame around the join-code screen with the keyboard up', () => {
      expect(codes(load('frame-join-code-keyboard'))).toContain('SCREEN_FRAME');
    });

    it('finds a synthetic inset card, and not the same card on the app background', () => {
      const framed = busyScreen();
      paint(framed, 0, 0, 14, 860, [11, 10, 18]);
      paint(framed, 386, 0, 400, 860, [11, 10, 18]);
      expect(findFrame(framed, { background: BG })?.detail).toContain('14px');
      const plain = busyScreen();
      expect(findFrame(plain, { background: BG })).toBeNull();
    });

    it('allows the presenter scale above an open sheet, and not a frame down the sheet', () => {
      const presenter = busyScreen();
      paint(presenter, 0, 0, 14, 600, [0, 0, 0]);
      paint(presenter, 386, 0, 400, 600, [0, 0, 0]);
      paint(presenter, 0, 600, 400, 860, [0x22, 0x1f, 0x3a]);
      expect(findFrame(presenter, { background: BG })).toBeNull();
      const insetSheet = copy(presenter);
      paint(insetSheet, 0, 600, 14, 860, [0, 0, 0]);
      paint(insetSheet, 386, 600, 400, 860, [0, 0, 0]);
      expect(findFrame(insetSheet, { background: BG })?.code).toBe('SCREEN_FRAME');
      const thick = busyScreen();
      paint(thick, 0, 0, 30, 600, [0, 0, 0]);
      paint(thick, 370, 0, 400, 600, [0, 0, 0]);
      paint(thick, 0, 600, 400, 860, [0x22, 0x1f, 0x3a]);
      expect(findFrame(thick, { background: BG })?.code).toBe('SCREEN_FRAME');
    });

    it('allows a sheet surface around a gutter-inset card, and not a frame from the top', () => {
      const sheet = busyScreen();
      paint(sheet, 0, 0, 400, 120, [9, 9, 16]);
      paint(sheet, 0, 120, 20, 860, [31, 27, 56]);
      paint(sheet, 380, 120, 400, 860, [31, 27, 56]);
      expect(findFrame(sheet, { background: BG })).toBeNull();
      const framed = busyScreen();
      paint(framed, 0, 0, 20, 860, [31, 27, 56]);
      paint(framed, 380, 0, 400, 860, [31, 27, 56]);
      expect(findFrame(framed, { background: BG })?.code).toBe('SCREEN_FRAME');
    });

    it('ignores full-bleed colour that fills the width', () => {
      const bleed = busyScreen();
      paint(bleed, 0, 0, 400, 430, [255, 150, 70]);
      expect(findFrame(bleed, { background: BG })).toBeNull();
    });
  });

  describe('KEYBOARD_BAND', () => {
    it('finds the keyboard on founder screenshots', () => {
      const top = keyboardTop(load('pitch-search-keyboard'));
      expect(top).not.toBeNull();
      expect((top ?? 0) / 852).toBeGreaterThan(0.6);
      expect(keyboardTop(load('inbox'))).toBeNull();
    });

    it('finds a black band between a pushed footer and the keyboard', () => {
      const image = copy(load('pitch-search-keyboard'));
      const top = keyboardTop(image) ?? 0;
      // The keyboard's corners are rounded: the band shows through them too.
      paint(image, 0, top - 40, image.width, top + 8, [0, 0, 0]);
      const band = findKeyboardBand(image);
      expect(band?.code).toBe('KEYBOARD_BAND');
      expect(band?.detail).toContain('#000000');
    });

    it('reads a light number pad (its grey tray too) as the keyboard, not a band', () => {
      const pad = load('phone-number-pad');
      expect(keyboardTop(pad)).not.toBeNull();
      expect(findKeyboardBand(pad)).toBeNull();
    });

    /**
     * A sheet with a results card that covers more rows than the sheet's own surface (the place
     * search on the vote, in Vietnamese), over a grey keyboard.
     */
    function sheetOverKeyboard(): { image: RgbaImage; keyboard: number } {
      const sheet: Rgb = [32, 28, 56];
      const card: Rgb = [44, 39, 80];
      const image = blank(400, 860, sheet);
      paint(image, 18, 120, 382, 470, card);
      for (let y = 490; y < 520; y += 16) paint(image, 30, y, 330, y + 8, [255, 214, 74]);
      const keyboard = 600;
      paint(image, 0, keyboard, 400, 860, [215, 218, 226]);
      return { image, keyboard };
    }

    it('passes a sheet whose own surface reaches the keyboard below a larger card', () => {
      const { image, keyboard } = sheetOverKeyboard();
      expect(keyboardTop(image)).toBe(keyboard);
      expect(findKeyboardBand(image)).toBeNull();
    });

    it('still finds a gap of another colour under a lifted footer on that sheet', () => {
      const { image, keyboard } = sheetOverKeyboard();
      // A footer lifted by the keyboard (its button on the sheet), and a black gap under it.
      paint(image, 30, keyboard - 90, 370, keyboard - 50, [255, 214, 74]);
      paint(image, 0, keyboard - 50, 400, keyboard, [0, 0, 0]);
      const band = findKeyboardBand(image);
      expect(band?.code).toBe('KEYBOARD_BAND');
      expect(band?.detail).toContain('#000000');
    });

    it('passes a screen whose own background runs down to the keyboard', () => {
      expect(findKeyboardBand(load('pitch-search-keyboard'))).toBeNull();
      expect(findKeyboardBand(load('frame-join-code-keyboard'))).toBeNull();
    });
  });

  describe('EMPTY_SCREEN', () => {
    it('finds the vote showdown that drew only its pill, the VS badge and the footer', () => {
      expect(codes(load('empty-vote-showdown'))).toEqual(['EMPTY_SCREEN']);
    });

    it('leaves a bare screen alone while the keyboard is up (a field has focus)', () => {
      const code = load('join-code-gboard');
      expect(keyboardTop(code)).not.toBeNull();
      expect(codes(code)).toEqual([]);
    });

    it('passes a busy screen and flags the same screen blank', () => {
      expect(findEmptyScreen(busyScreen())).toBeNull();
      const empty = blank(400, 860, BG);
      paint(empty, 30, 100, 200, 130, [240, 235, 220]);
      expect(findEmptyScreen(empty)?.code).toBe('EMPTY_SCREEN');
    });

    it('skips only the shots listed as sparse by design, and still runs the other checks on them', () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'screen-scan-'));
      try {
        const shoot = (fixture: string, shot: string) =>
          copyFileSync(path.join(FIXTURES, `${fixture}.png`), path.join(dir, `${shot}.png`));
        shoot('empty-vote-showdown', 'en-join-code-from-crews');
        shoot('empty-vote-showdown', 'vi-join-code-from-crews');
        shoot('empty-vote-showdown', 'en-join-code-from-crews-typed');
        shoot('empty-vote-showdown', 'en-vote-showdown');
        shoot('frame-sheet-over-chat', 'en-gallery-rise');
        const found = scanScreenshots(dir, BG);
        const codesOf = (shot: string) => found.get(shot)?.map((f) => f.code);
        expect(codesOf('en-join-code-from-crews')).toBeUndefined();
        expect(codesOf('vi-join-code-from-crews')).toBeUndefined();
        expect(codesOf('en-join-code-from-crews-typed')).toEqual(['EMPTY_SCREEN']);
        expect(codesOf('en-vote-showdown')).toEqual(['EMPTY_SCREEN']);
        expect(codesOf('en-gallery-rise')).toContain('SCREEN_FRAME');
        expect(codesOf('en-gallery-rise')).not.toContain('EMPTY_SCREEN');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
