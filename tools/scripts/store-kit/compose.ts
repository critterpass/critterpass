/**
 * Store screenshots: each raw capture (`capture.ts --collect`) set into its designed frame, with
 * the shot's caption, for every store size in `devices.json` and every shipped language.
 *
 *   pnpm tsx tools/scripts/store-kit/compose.ts [--locale en,vi] [--store play] [--out <dir>]
 *
 * Reads `<out>/raw/<platform>/<locale>/<shot>.png` and writes
 * `<out>/<store>/<size>/<locale>/<n>-<shot>.png` plus `<out>/manifest.json`. A capture that is not
 * there fails the run with the full list: nothing is drawn in its place.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  shotLocales,
  storeListings,
  storeShotTemplates,
  type ShotTemplate,
} from '@cp/content/store';
import type { AppLocale } from '@cp/domain';

import {
  card,
  frame,
  image,
  rect,
  sticker,
  text,
} from '../../../packages/critter-art/src/share/layout';
import type { CardLayout, LayoutNode } from '../../../packages/critter-art/src/share/model';
import { rawPath, STORE_OUT } from './capture';
import { shotTargets, type ShotTarget } from './devices';
import { fitText, type MeasureAt } from './fit-text';
import { pngInfo } from './png';
import { BODY_FONT, HEADLINE_FONT, measurer, renderOpaquePng } from './render';

/** The design's logical width: every measure below is in its units and scales with the target. */
const DESIGN_WIDTH = 360;
const MARGIN = 26;
const HEADLINE_SIZES = [38, 36, 34, 32, 30, 28, 26];
const SUB_SIZES = [15, 14, 13];
const BEZEL = 8;
const DEVICE_INSET = 34;
const DEVICE_TILT_DEG = -3;
const BEZEL_COLOUR = '#0e0c1b';

export interface RawCapture {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface ShotInput {
  readonly template: ShotTemplate;
  readonly locale: AppLocale;
  readonly target: Pick<ShotTarget, 'width' | 'height'>;
  readonly raw: RawCapture;
  readonly measure: { readonly headline: MeasureAt; readonly sub: MeasureAt };
}

export interface ShotLayout {
  readonly layout: CardLayout;
  /** Where the capture sits before the device's tilt, in target pixels. */
  readonly screen: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly headlineSize: number;
}

/** One store shot: caption band on top, the capture in a device frame that runs off the bottom. */
export function shotLayout(input: ShotInput): ShotLayout {
  const { template, target } = input;
  const caption = template.caption[input.locale];
  if (caption === undefined) throw new Error(`${template.id} has no ${input.locale} caption`);
  const s = target.width / DESIGN_WIDTH;
  const textWidth = target.width - 2 * MARGIN * s;

  const headline = fitText(caption.headline, input.measure.headline, {
    maxWidth: textWidth,
    maxLines: 3,
    sizes: HEADLINE_SIZES.map((size) => Math.round(size * s)),
  });
  const sub = fitText(caption.sub, input.measure.sub, {
    maxWidth: textWidth,
    maxLines: 2,
    sizes: SUB_SIZES.map((size) => Math.round(size * s)),
  });
  const headlineTop = 40 * s;
  const subTop = headlineTop + headline.lines.length * headline.fontSize + 12 * s;
  const subLine = Math.round(sub.fontSize * 1.4);
  const deviceTop = subTop + sub.lines.length * subLine + 30 * s;

  const deviceW = target.width - 2 * DEVICE_INSET * s;
  const screenW = deviceW - 2 * BEZEL * s;
  const screenH = (screenW * input.raw.height) / input.raw.width;
  const deviceH = screenH + 2 * BEZEL * s;
  const deviceX = DEVICE_INSET * s;
  const screen = { x: deviceX + BEZEL * s, y: deviceTop + BEZEL * s, w: screenW, h: screenH };

  const nodes: LayoutNode[] = [
    text(
      MARGIN * s,
      headlineTop,
      textWidth,
      caption.headline,
      {
        fontFamily: HEADLINE_FONT.family,
        fontWeight: HEADLINE_FONT.weight,
        fontSize: headline.fontSize,
        color: template.ink,
      },
      { maxLines: 3, lineHeight: headline.fontSize },
    ),
    text(
      MARGIN * s,
      subTop,
      textWidth,
      caption.sub,
      {
        fontFamily: BODY_FONT.family,
        fontWeight: BODY_FONT.weight,
        fontSize: sub.fontSize,
        color: template.ink,
      },
      { maxLines: 2, lineHeight: subLine },
    ),
    frame(
      deviceX,
      deviceTop,
      deviceW,
      deviceH,
      [
        rect(0, 0, deviceW, deviceH, BEZEL_COLOUR, { radius: 44 * s }),
        image(
          BEZEL * s,
          BEZEL * s,
          screenW,
          screenH,
          { bytes: input.raw.bytes },
          { radius: 36 * s },
        ),
      ],
      DEVICE_TILT_DEG,
    ),
  ];
  if (template.accent !== undefined) {
    const size = 96 * s;
    nodes.push(sticker(4 * s, target.height - size - 8 * s, size, template.accent));
  }
  return {
    layout: card(target.width, target.height, nodes, template.background),
    screen,
    headlineSize: headline.fontSize,
  };
}

/** Renders one shot and checks it is exactly what the store takes: the size, and no alpha. */
export async function renderShot(input: ShotInput): Promise<Buffer> {
  const png = await renderOpaquePng(shotLayout(input).layout);
  const info = pngInfo(png);
  if (info.width !== input.target.width || info.height !== input.target.height || info.alpha) {
    throw new Error(`${input.template.id}: rendered ${String(info.width)}x${String(info.height)}`);
  }
  return png;
}

export function shotFile(target: ShotTarget, locale: string, template: ShotTemplate): string {
  return path.join(
    target.store,
    target.id,
    locale,
    `${String(template.order).padStart(2, '0')}-${template.id}.png`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      locale: { type: 'string' },
      store: { type: 'string' },
      out: { type: 'string', default: STORE_OUT },
    },
  });
  const templates = storeShotTemplates();
  const listed = Object.keys(storeListings()) as AppLocale[];
  const locales = shotLocales(templates, listed, values.locale?.split(',').filter(Boolean));
  const targets = shotTargets().filter(
    (target) => values.store === undefined || target.store === values.store,
  );
  if (targets.length === 0) throw new Error('--store must be app-store or play');

  const jobs = locales.flatMap((locale) =>
    targets.flatMap((target) =>
      templates.map((template) => ({
        locale,
        target,
        template,
        raw: rawPath(values.out, target.capture, locale, template.id),
      })),
    ),
  );
  const missing = [...new Set(jobs.map((job) => job.raw).filter((file) => !existsSync(file)))];
  if (missing.length > 0) {
    throw new Error(`captures missing (run capture.ts --collect):\n- ${missing.join('\n- ')}`);
  }

  const measure = { headline: measurer(HEADLINE_FONT), sub: measurer(BODY_FONT) };
  const manifest: Record<string, unknown>[] = [];
  for (const job of jobs) {
    const bytes = readFileSync(job.raw);
    const raw = { bytes, ...pngInfo(bytes) };
    const png = await renderShot({ ...job, raw, measure });
    const file = shotFile(job.target, job.locale, job.template);
    mkdirSync(path.dirname(path.join(values.out, file)), { recursive: true });
    writeFileSync(path.join(values.out, file), png);
    manifest.push({
      file,
      store: job.target.store,
      size: job.target.id,
      locale: job.locale,
      shot: job.template.id,
      width: job.target.width,
      height: job.target.height,
    });
  }
  writeFileSync(path.join(values.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${String(manifest.length)} store shots under ${values.out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
