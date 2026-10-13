import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  composePair,
  parseCompareArgs,
  planPairs,
  premiumCodeOf,
  premiumTitles,
  PREMIUM_RENDERS_DIR,
  SHEET,
  writeSheets,
} from './compare-app-screens';
import { CliArgsError } from './e2e-cloud';
import { createCanvas, loadImage } from './review-canvas';

describe('planPairs', () => {
  it('pairs premium screenshots with the render of their code, sorted by name', () => {
    const premium = {
      files: ['/p/3.01.png', '/p/3.10.png', '/p/10.store-3.png'],
      titles: new Map([['3.01', '3.01 Home']]),
    };
    const pairs = planPairs(
      [
        '/d/premium-3.10-invite-dark.png',
        '/d/premium-3.01-home-light.png',
        '/d/premium-10.store-3-shot.png',
        '/d/premium-4.99-unknown.png',
        '/d/home.png',
      ],
      premium,
    );
    expect(pairs.map((pair) => [pair.name, pair.id, pair.design, pair.title])).toEqual([
      ['home', undefined, undefined, undefined],
      ['premium-10.store-3-shot', '10.store-3', '/p/10.store-3.png', '10.store-3'],
      ['premium-3.01-home-light', '3.01', '/p/3.01.png', '3.01 Home'],
      ['premium-3.10-invite-dark', '3.10', '/p/3.10.png', '3.10'],
      ['premium-4.99-unknown', '4.99', undefined, '4.99'],
    ]);
  });

  it('never matches 3.01 to 3.010 or a legacy screen id', () => {
    const premium = { files: ['/p/3.01.png'], titles: new Map<string, string>() };
    expect(planPairs(['/d/en-3a-1-splash.png'], premium)[0]?.design).toBeUndefined();
    expect(planPairs(['/d/premium-3.010-x.png'], premium)[0]?.design).toBeUndefined();
  });
});

describe('premiumCodeOf', () => {
  it('reads the code after the premium prefix only', () => {
    expect(premiumCodeOf('premium-2.05-name-light')).toBe('2.05');
    expect(premiumCodeOf('premium-a-premium-9.10-paywall')).toBe('9.10');
    expect(premiumCodeOf('en-3a-2-name')).toBeUndefined();
    expect(premiumCodeOf('premium-shell-01-legend-top')).toBeUndefined();
  });

  it('titles every committed premium render from screens.json', () => {
    const titles = premiumTitles();
    expect(titles.get('3.01')).toMatch(/^3\.01 Home/u);
    expect(titles.size).toBeGreaterThan(200);
  });
});

describe('parseCompareArgs', () => {
  it('needs --out and either flows or --from', () => {
    expect(() => parseCompareArgs(['--flows', 'a.yaml'], '/repo')).toThrow(CliArgsError);
    expect(() => parseCompareArgs(['--out', 'o'], '/repo')).toThrow(CliArgsError);
    expect(parseCompareArgs(['--', '--from', 'shots', '--out', 'o'], '/repo')).toEqual({
      flows: [],
      from: '/repo/shots',
      out: '/repo/o',
      dark: false,
      device: 'iPhone 17',
    });
  });
});

// PNG encoding of full-height sheets is slow on CI runners.
describe('sheets', { timeout: 60_000 }, () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cp-compare-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function devicePng(name: string): string {
    const canvas = createCanvas(402, 874);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff5fa8';
    ctx.fillRect(0, 0, 402, 874);
    const file = path.join(dir, `${name}.png`);
    writeFileSync(file, canvas.toBuffer('image/png'));
    return file;
  }

  it('puts the design and the device side by side at the same height', async () => {
    const design = path.join(PREMIUM_RENDERS_DIR, '2.05.png');
    const sheet = await loadImage(
      await composePair({
        name: 'premium-2.05-name-light',
        device: devicePng('premium-2.05-name-light'),
        id: '2.05',
        design,
        title: '2.05 Your name',
      }),
    );
    const designImage = await loadImage(design);
    const designWidth = Math.round((designImage.width / designImage.height) * SHEET.screenHeight);
    const deviceWidth = Math.round((402 / 874) * SHEET.screenHeight);
    expect(sheet.height).toBe(SHEET.pad * 2 + SHEET.caption + SHEET.screenHeight);
    expect(sheet.width).toBe(SHEET.pad * 2 + designWidth + SHEET.gap + deviceWidth);
  });

  it('writes one sheet per screenshot and an index', async () => {
    devicePng('premium-2.01-splash-light');
    devicePng('home');
    const out = path.join(dir, 'sheets');
    const written = await writeSheets(dir, out);
    expect(written.map((file) => path.basename(file))).toEqual([
      'home.png',
      'premium-2.01-splash-light.png',
      'index.png',
    ]);
    expect(readdirSync(out).sort()).toEqual([
      'home.png',
      'index.png',
      'premium-2.01-splash-light.png',
    ]);
  });
});
