import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  composePair,
  designIdOf,
  parseCompareArgs,
  planPairs,
  RENDERS_DIR,
  renderTitle,
  SHEET,
  writeSheets,
} from './compare-app-screens';
import { CliArgsError } from './e2e-cloud';
import { createCanvas, loadImage } from './review-canvas';

describe('designIdOf', () => {
  it('finds the screen id in a screenshot name', () => {
    expect(designIdOf('en-3a-2-name')).toBe('3a-2');
    expect(designIdOf('vi-3a-10-invite')).toBe('3a-10');
    expect(designIdOf('3a-9-permissions')).toBe('3a-9');
    expect(designIdOf('en-3a-4-summary')).toBe('3a-4');
    expect(designIdOf('dev-tools')).toBeUndefined();
    expect(designIdOf('home')).toBeUndefined();
  });
});

describe('planPairs', () => {
  const renders = ['/r/3a-1_Splash.png', '/r/3a-10_Invite.png', '/r/3a-2_Your_name.png'];
  it('pairs by id, sorted by name, and leaves screens without a render unpaired', () => {
    expect(
      planPairs(['/d/en-3a-2-name.png', '/d/en-3a-1-splash.png', '/d/home.png'], renders),
    ).toEqual([
      {
        name: 'en-3a-1-splash',
        device: '/d/en-3a-1-splash.png',
        id: '3a-1',
        design: '/r/3a-1_Splash.png',
      },
      {
        name: 'en-3a-2-name',
        device: '/d/en-3a-2-name.png',
        id: '3a-2',
        design: '/r/3a-2_Your_name.png',
      },
      { name: 'home', device: '/d/home.png', id: undefined, design: undefined },
    ]);
  });

  it('never matches 3a-1 to 3a-10', () => {
    expect(planPairs(['/d/en-3a-10-invite.png'], renders)[0]?.design).toBe('/r/3a-10_Invite.png');
  });

  it('titles a render from its file name', () => {
    expect(renderTitle('/r/3a-2_Your_name.png')).toBe('3a-2 Your name');
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
    const design = path.join(RENDERS_DIR, '3a-2_Your_name.png');
    const sheet = await loadImage(
      await composePair({
        name: 'en-3a-2-name',
        device: devicePng('en-3a-2-name'),
        id: '3a-2',
        design,
      }),
    );
    const designImage = await loadImage(design);
    const designWidth = Math.round((designImage.width / designImage.height) * SHEET.screenHeight);
    const deviceWidth = Math.round((402 / 874) * SHEET.screenHeight);
    expect(sheet.height).toBe(SHEET.pad * 2 + SHEET.caption + SHEET.screenHeight);
    expect(sheet.width).toBe(SHEET.pad * 2 + designWidth + SHEET.gap + deviceWidth);
  });

  it('writes one sheet per screenshot and an index', async () => {
    devicePng('en-3a-1-splash');
    devicePng('home');
    const out = path.join(dir, 'sheets');
    const written = await writeSheets(dir, out);
    expect(written.map((file) => path.basename(file))).toEqual([
      'en-3a-1-splash.png',
      'home.png',
      'index.png',
    ]);
    expect(readdirSync(out).sort()).toEqual(['en-3a-1-splash.png', 'home.png', 'index.png']);
  });
});
