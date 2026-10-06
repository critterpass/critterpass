import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { shotLocales, storeListings, storeShotTemplates } from '@cp/content/store';
import type { AppLocale } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { decodePng } from '../ci-device/png';
import { captureName, collect, dispatchArgs, flowFiles, rawPath } from './capture';
import { renderShot, shotFile, shotLayout } from './compose';
import { parseTargets, shotTargets, targetIssue } from './devices';
import { fitText } from './fit-text';
import { iconIssues } from './icons';
import { encodeRgbPng, pngInfo, withoutAlpha } from './png';
import { BODY_FONT, HEADLINE_FONT, measurer } from './render';

const REPO = path.resolve(import.meta.dirname, '../../..');
const templates = storeShotTemplates();
const locales = shotLocales(templates, Object.keys(storeListings()) as AppLocale[]);

/** A stand-in capture: one flat colour at a phone's proportions. */
function flatCapture(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([r, g, b, 255], i);
  return encodeRgbPng(width, height, rgba);
}

describe('store sizes', () => {
  it('lists only sizes the stores take', () => {
    expect(shotTargets().map((target) => `${target.store}/${target.id}`)).toEqual([
      'app-store/iphone-6.9',
      'app-store/iphone-6.3',
      'play/phone',
      'play/tablet-7',
      'play/tablet-10',
    ]);
  });

  it('refuses a size a store would refuse', () => {
    const play = { store: 'play', capture: 'android' } as const;
    const apple = { store: 'app-store', capture: 'ios' } as const;
    expect(targetIssue({ ...apple, id: 'iphone-6.9', width: 1284, height: 2778 })).toMatch(
      /not one of 1290x2796/u,
    );
    expect(targetIssue({ ...apple, id: 'ipad-13', width: 2064, height: 2752 })).toMatch(
      /not an App Store display set/u,
    );
    expect(targetIssue({ ...play, id: 'phone', width: 1080, height: 2400 })).toMatch(/not 9:16/u);
    expect(targetIssue({ ...play, id: 'phone', width: 720, height: 1280 })).toMatch(/narrower/u);
    expect(targetIssue({ ...play, id: 'tablet-10', width: 2250, height: 4000 })).toMatch(/taller/u);
    expect(() =>
      parseTargets({
        captures: {
          ios: { workflowPlatform: 'ios', statusBar: 'clean' },
          android: { workflowPlatform: 'android', statusBar: 'clean' },
        },
        targets: [{ ...play, id: 'phone', width: 1080, height: 2400 }],
      }),
    ).toThrow(/store sizes/u);
  });
});

describe('store captures', () => {
  it('has a flow per shipped language that takes every shot by its name', () => {
    const steps = readFileSync(path.join(REPO, 'e2e/store-shots/subflows/shots.yaml'), 'utf8');
    const taken = [...steps.matchAll(/^- takeScreenshot: store-\$\{LANG\}-(.+)$/gmu)].map(
      (match) => match[1],
    );
    expect(taken.sort()).toEqual(templates.map((template) => template.id).sort());
    for (const flow of flowFiles(locales)) {
      expect(readFileSync(path.join(REPO, flow), 'utf8')).toContain('../subflows/shots.yaml');
    }
  });

  it('starts one small run per platform and needs the build for Android', () => {
    const args = dispatchArgs({
      platform: 'android',
      locales: ['en', 'vi'],
      ref: 'main',
      buildUrl: 'https://example.com/app.apk',
    });
    expect(args).toContain('flows=e2e/store-shots/en/shots.yaml e2e/store-shots/vi/shots.yaml');
    expect(args).toContain('shards=1');
    expect(() => dispatchArgs({ platform: 'android', locales: ['en'], ref: 'main' })).toThrow(
      /build-url/u,
    );
    expect(dispatchArgs({ platform: 'ios', locales: ['en'], ref: 'main' })).not.toContain(
      'build_url',
    );
  });

  it('files a run by platform, language and shot and lists what the run lacks', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'store-captures-'));
    const artifact = path.join(dir, 'artifact/shard-1/screenshots');
    mkdirSync(artifact, { recursive: true });
    const capture = flatCapture(4, 8, [1, 2, 3]);
    writeFileSync(path.join(artifact, `${captureName('en', 'vote')}.png`), capture);
    writeFileSync(path.join(artifact, 'en-3b-1-board.png'), capture);
    const out = path.join(dir, 'out');
    const result = collect({
      artifactDir: path.join(dir, 'artifact'),
      out,
      platform: 'android',
      locales: ['en', 'vi'],
      shots: ['vote', 'money'],
    });
    expect(result.filed).toEqual([rawPath(out, 'android', 'en', 'vote')]);
    expect(existsSync(rawPath(out, 'android', 'en', 'vote'))).toBe(true);
    expect(result.missing).toEqual([
      'store-en-money.png',
      'store-vi-vote.png',
      'store-vi-money.png',
    ]);

    mkdirSync(path.join(dir, 'artifact/shard-2'), { recursive: true });
    writeFileSync(path.join(dir, 'artifact/shard-2/store-en-vote.png'), capture);
    expect(() =>
      collect({
        artifactDir: path.join(dir, 'artifact'),
        out,
        platform: 'android',
        locales: ['en'],
        shots: ['vote'],
      }),
    ).toThrow(/in the run twice/u);
  });
});

describe('caption fitting', () => {
  // Ten units a character at size 10, scaling with the size.
  const measureAt = (text: string, size: number): number => text.length * size;

  it('takes the largest size that fits the lines', () => {
    const options = { maxWidth: 200, maxLines: 2, sizes: [20, 10, 5] };
    expect(fitText('ONE TWO', measureAt, options)).toEqual({ fontSize: 20, lines: ['ONE TWO'] });
    expect(fitText('ONE TWO THREE FOUR FIVE', measureAt, options).fontSize).toBe(10);
  });

  it('refuses copy that fits at no size, and a word wider than the band', () => {
    const options = { maxWidth: 50, maxLines: 1, sizes: [10, 5] };
    expect(() => fitText('ONE TWO THREE FOUR', measureAt, options)).toThrow(/shorten it/u);
    expect(() => fitText('UNBREAKABLEWORD', measureAt, options)).toThrow(/shorten it/u);
  });
});

describe('store shot compositor', { timeout: 120_000 }, () => {
  const measure = { headline: measurer(HEADLINE_FONT), sub: measurer(BODY_FONT) };
  const bytes = flatCapture(270, 585, [10, 143, 127]);
  const raw = { bytes, width: 270, height: 585 };

  it('fits every caption in every shipped language at every store size', () => {
    for (const target of shotTargets()) {
      for (const locale of locales) {
        for (const template of templates) {
          const { screen } = shotLayout({ template, locale, target, raw, measure });
          // The capture keeps its proportions and starts on the canvas.
          expect(screen.h / screen.w).toBeCloseTo(585 / 270, 5);
          expect(screen.y).toBeLessThan(target.height * 0.6);
        }
      }
    }
  });

  it('renders each store size exactly, opaque, with the capture inside the frame', async () => {
    const [vote] = templates;
    if (vote === undefined) throw new Error('no shots');
    for (const target of shotTargets()) {
      const png = await renderShot({ template: vote, locale: 'vi', target, raw, measure });
      expect(pngInfo(png)).toEqual({ width: target.width, height: target.height, alpha: false });
      const image = decodePng(png);
      const at = (x: number, y: number): number[] => {
        const i = (Math.round(y) * image.width + Math.round(x)) * 4;
        return [...image.data.subarray(i, i + 3)];
      };
      expect(at(target.width - 4, 4)).toEqual([0xff, 0xd8, 0x4a]);
      expect(at(target.width / 2, target.height * 0.75)).toEqual([10, 143, 127]);
    }
    expect(shotFile(shotTargets()[0]!, 'vi', vote)).toBe('app-store/iphone-6.9/vi/01-vote.png');
  });
});

describe('store icons', () => {
  const layer = (side: number, alpha: boolean) => ({ width: side, height: side, alpha });
  const set = {
    icon: layer(1024, false),
    adaptiveForeground: layer(1024, true),
    adaptiveBackground: layer(1024, false),
    monochrome: layer(1024, true),
  };

  it('accepts the layered icon and names what a store or launcher would refuse', () => {
    expect(iconIssues(set)).toEqual([]);
    expect(iconIssues({ ...set, icon: layer(512, false) })).toEqual([
      'icon: 512x512, needs 1024x1024',
    ]);
    expect(
      iconIssues({ ...set, adaptiveForeground: layer(1024, false), monochrome: layer(432, true) }),
    ).toEqual([
      'monochrome layer: 432x432, needs 1024x1024',
      'adaptive foreground: has no transparency',
    ]);
  });

  it('strips an opaque alpha channel and refuses real transparency', () => {
    const opaque = flatCapture(2, 2, [9, 9, 9]);
    expect(pngInfo(withoutAlpha(opaque))).toEqual({ width: 2, height: 2, alpha: false });
    expect(() => encodeRgbPng(1, 1, new Uint8Array([0, 0, 0, 128]))).toThrow(/not opaque/u);
  });
});
