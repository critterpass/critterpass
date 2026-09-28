/**
 * Design | device review sheets for the mobile app.
 *
 *   pnpm screens:compare -- --flows e2e/onboarding/screens-en.yaml --out ./compare [--dark]
 *   pnpm screens:compare -- --from ./screens --out ./compare     (sheets from earlier captures)
 *
 * Captures the flows exactly like `pnpm screens:capture` (into --out/device), then pairs every
 * screenshot whose name carries a design screen id (`en-3a-2-name` → `3a-2`) with its render in
 * docs/design-renders/screens, and writes one side-by-side PNG per screen plus index.png, a grid of
 * every pair, so a reviewer can scan a whole flow in one look. Screens with no render are shown
 * alone and labelled so. A capture that fails (a flow, or `[ui-qa]` reports) still gets its sheets
 * written from whatever was captured before the command fails.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { capture } from './capture-app-screens';
import { CliArgsError } from './e2e-cloud';
import { createCanvas, GlobalFonts, loadImage, type CanvasImage } from './review-canvas';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
export const RENDERS_DIR = path.join(REPO_ROOT, 'docs/design-renders/screens');
const FONT = path.join(REPO_ROOT, 'apps/mobile/assets/fonts/Geist-600.ttf');

/** Sheet geometry, in pixels: both screens are drawn this tall, under a caption bar. */
export const SHEET = { screenHeight: 1200, pad: 32, gap: 32, caption: 72 } as const;
const INDEX_COLUMNS = 3;
const INDEX_WIDTH = 2400;
const INK = '#16131f';
const PAPER = '#f4efe4';
const MUTED = '#a9a3c0';

export interface CompareOptions {
  readonly flows: string[];
  readonly from: string | undefined;
  readonly out: string;
  readonly dark: boolean;
  readonly device: string;
}

export function parseCompareArgs(argv: string[], baseDir: string): CompareOptions {
  const args = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      flows: { type: 'string', multiple: true },
      from: { type: 'string' },
      out: { type: 'string' },
      dark: { type: 'boolean', default: false },
      device: { type: 'string' },
    },
  });
  const flows = [...(values.flows ?? []), ...positionals].map((flow) =>
    path.resolve(baseDir, flow),
  );
  if (!values.out) throw new CliArgsError('--out is required (directory for the sheets)');
  if (flows.length === 0 && !values.from)
    throw new CliArgsError(
      '--flows (Maestro flows to capture) or --from (captured PNGs) is required',
    );
  return {
    flows,
    from: values.from ? path.resolve(baseDir, values.from) : undefined,
    out: path.resolve(baseDir, values.out),
    dark: values.dark,
    device: values.device ?? 'iPhone 17',
  };
}

/** The design screen id a screenshot name carries (`en-3a-2-name` → `3a-2`), if any. */
export function designIdOf(name: string): string | undefined {
  return /(?:^|[-_])(\d+[a-z]-\d+)(?=$|[-_.])/u.exec(name)?.[1];
}

export interface Pair {
  /** Screenshot name without `.png`. */
  readonly name: string;
  readonly device: string;
  readonly id: string | undefined;
  readonly design: string | undefined;
}

/** Pairs each captured PNG with the render whose file name starts with its screen id. */
export function planPairs(devicePngs: readonly string[], renders: readonly string[]): Pair[] {
  return [...devicePngs].sort().map((device) => {
    const name = path.basename(device, '.png');
    const id = designIdOf(name);
    const render = id
      ? renders.find((file) => path.basename(file).startsWith(`${id}_`))
      : undefined;
    return { name, device, id, design: render };
  });
}

/** A render's title from its file name: `3a-2_Your_name.png` → `3a-2 Your name`. */
export function renderTitle(file: string): string {
  const [id = '', ...words] = path.basename(file, '.png').split('_');
  return [id, words.join(' ')].filter(Boolean).join(' ');
}

function scaledWidth(image: CanvasImage, height: number): number {
  return Math.round((image.width / image.height) * height);
}

/** One sheet: design on the left, device on the right, each under its caption. */
export async function composePair(pair: Pair): Promise<Buffer> {
  const { screenHeight: h, pad, gap, caption } = SHEET;
  const device = await loadImage(pair.device);
  const design = pair.design ? await loadImage(pair.design) : undefined;
  const designWidth = design ? scaledWidth(design, h) : Math.round(scaledWidth(device, h));
  const deviceWidth = scaledWidth(device, h);
  const canvas = createCanvas(pad * 2 + designWidth + gap + deviceWidth, pad * 2 + caption + h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 30px Geist';
  ctx.textBaseline = 'middle';
  const label = (text: string, x: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillText(text, x, pad + caption / 2);
  };
  const top = pad + caption;
  if (design && pair.design) {
    label(`DESIGN  ${renderTitle(pair.design)}`, pad, PAPER);
    ctx.drawImage(design, pad, top, designWidth, h);
  } else {
    label('DESIGN  no render for this screen', pad, MUTED);
    ctx.strokeStyle = MUTED;
    ctx.setLineDash([12, 12]);
    ctx.strokeRect(pad, top, designWidth, h);
    ctx.setLineDash([]);
  }
  const deviceX = pad + designWidth + gap;
  label(`DEVICE  ${pair.name}`, deviceX, PAPER);
  ctx.drawImage(device, deviceX, top, deviceWidth, h);
  return canvas.toBuffer('image/png');
}

/** Every sheet in a grid, in capture order, so a whole flow reads in one image. */
export async function composeIndex(sheets: readonly Buffer[]): Promise<Buffer> {
  const images = await Promise.all(sheets.map((sheet) => loadImage(sheet)));
  const cell = Math.floor((INDEX_WIDTH - SHEET.pad * (INDEX_COLUMNS + 1)) / INDEX_COLUMNS);
  const heights = images.map((image) => Math.round((image.height / image.width) * cell));
  const rowHeight = Math.max(1, ...heights);
  const rows = Math.max(1, Math.ceil(images.length / INDEX_COLUMNS));
  const canvas = createCanvas(INDEX_WIDTH, SHEET.pad + rows * (rowHeight + SHEET.pad));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0b13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, index) => {
    const x = SHEET.pad + (index % INDEX_COLUMNS) * (cell + SHEET.pad);
    const y = SHEET.pad + Math.floor(index / INDEX_COLUMNS) * (rowHeight + SHEET.pad);
    ctx.drawImage(image, x, y, cell, heights[index] ?? rowHeight);
  });
  return canvas.toBuffer('image/png');
}

function pngsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .map((name) => path.join(dir, name));
}

/** Writes `<out>/<name>.png` per pair and `<out>/index.png`; returns the sheet paths. */
export async function writeSheets(deviceDir: string, out: string): Promise<string[]> {
  if (GlobalFonts.families.every((family) => family.family !== 'Geist'))
    GlobalFonts.registerFromPath(FONT, 'Geist');
  mkdirSync(out, { recursive: true });
  const pairs = planPairs(pngsIn(deviceDir), pngsIn(RENDERS_DIR));
  const sheets: Buffer[] = [];
  const written: string[] = [];
  for (const pair of pairs) {
    const sheet = await composePair(pair);
    const file = path.join(out, `${pair.name}.png`);
    writeFileSync(file, sheet);
    sheets.push(sheet);
    written.push(file);
  }
  if (sheets.length > 0) {
    const index = path.join(out, 'index.png');
    writeFileSync(index, await composeIndex(sheets));
    written.push(index);
  }
  return written;
}

async function main(): Promise<void> {
  let options: CompareOptions;
  try {
    options = parseCompareArgs(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const deviceDir = options.from ?? path.join(options.out, 'device');
  let failure: string | undefined;
  if (!options.from) {
    try {
      await capture({ ...options, out: deviceDir });
    } catch (error) {
      failure = error instanceof Error ? error.message : 'The capture failed';
    }
  }
  const sheets = await writeSheets(deviceDir, path.join(options.out, 'sheets'));
  for (const sheet of sheets) console.log(`  ${sheet}`);
  if (failure !== undefined) {
    console.error(failure);
    process.exitCode = 1;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) void main();
