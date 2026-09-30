/**
 * Renders the README banner (dark and light, 1280×400) with `@cp/critter-art`'s share renderer: the
 * CRITTERPASS wordmark in Archivo plus the six guide critters as stickers.
 *
 *   pnpm tsx tools/scripts/readme/banner.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { pathToFileURL } from 'node:url';

// The scripts package doesn't depend on `@cp/critter-art` (its source pulls in DOM types), so the
// share renderer is loaded by path and typed here with just what the banner uses.
type LayoutNode = { readonly type: string };
interface TextRunStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly fontWeight: number;
}
interface ShareRenderer {
  rect: (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    options?: { radius?: number },
  ) => LayoutNode;
  text: (
    x: number,
    y: number,
    w: number,
    value: string,
    style: TextRunStyle,
    options?: { align?: 'left' | 'center' | 'right'; lineHeight?: number },
  ) => LayoutNode;
  sticker: (
    x: number,
    y: number,
    size: number,
    spec: { kind: string; seed: number },
    options?: { rotationDeg?: number },
  ) => LayoutNode;
  registerFonts: (fonts: readonly { family: string; bytes: Uint8Array }[]) => void;
  renderCardNode: (layout: {
    width: number;
    height: number;
    background: string;
    nodes: readonly LayoutNode[];
  }) => Promise<Uint8Array>;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const FONTS = path.join(REPO_ROOT, 'apps/mobile/assets/fonts');
const OUT = path.join(REPO_ROOT, 'docs/assets/readme');
const { rect, registerFonts, renderCardNode, sticker, text } = (await import(
  pathToFileURL(path.join(REPO_ROOT, 'packages/critter-art/src/share/index.ts')).href
)) as ShareRenderer;
const WIDTH = 1280;
const HEIGHT = 400;

interface Theme {
  readonly name: 'dark' | 'light';
  readonly background: string;
  readonly dots: string;
  readonly wordmark: string;
  readonly body: string;
  readonly muted: string;
  readonly pill: string;
  readonly pillText: string;
}

// Colours from `@cp/design-tokens`: ink.850 night, paper.base, yellow, paper.ink, ink.200.
const THEMES: readonly Theme[] = [
  {
    name: 'dark',
    background: '#17142a',
    dots: 'rgba(255,255,255,0.06)',
    wordmark: '#ffd84a',
    body: '#f4efe4',
    muted: '#a9a3c0',
    pill: '#ffd84a',
    pillText: '#17142a',
  },
  {
    name: 'light',
    background: '#f4efe4',
    dots: 'rgba(33,29,24,0.07)',
    wordmark: '#211d18',
    body: '#211d18',
    muted: '#5d564b',
    pill: '#211d18',
    pillText: '#ffd84a',
  },
];

// The splash screen's cast (3a-1): each guide at a fixed seed, size and tilt.
const STICKERS = [
  { kind: 'gecko', x: 850, y: 28, size: 170, tilt: -8 },
  { kind: 'tanuki', x: 1070, y: 18, size: 150, tilt: 10 },
  { kind: 'puffin', x: 1125, y: 200, size: 140, tilt: -6 },
  { kind: 'axolotl', x: 812, y: 214, size: 140, tilt: 7 },
  { kind: 'sardine', x: 985, y: 262, size: 130, tilt: -12 },
  { kind: 'alpaca', x: 1000, y: 140, size: 115, tilt: 4 },
] as const;

function style(
  fontFamily: string,
  fontSize: number,
  color: string,
  fontWeight = 400,
): TextRunStyle {
  return { fontFamily, fontSize, color, fontWeight };
}

function dotGrid(color: string): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  for (let y = 12; y < HEIGHT; y += 24) {
    for (let x = 12; x < WIDTH; x += 24) nodes.push(rect(x, y, 3, 3, color, { radius: 1.5 }));
  }
  return nodes;
}

function banner(theme: Theme): LayoutNode[] {
  return [
    ...dotGrid(theme.dots),
    text(72, 60, 700, 'GROUP TRAVEL · iOS + ANDROID', style('GeistMono', 20, theme.muted)),
    text(64, 96, 760, 'CRITTERPASS', style('ArchivoCondensed', 136, theme.wordmark, 900), {
      lineHeight: 150,
    }),
    text(
      72,
      244,
      640,
      'Vote on where to go, let a critter guide draft the trip, then travel it together.',
      style('Geist', 28, theme.body, 600),
      { lineHeight: 38 },
    ),
    rect(72, 342, 318, 34, theme.pill, { radius: 17 }),
    text(72, 342, 318, 'Your pass to every place', style('Geist', 18, theme.pillText, 600), {
      align: 'center',
      lineHeight: 30,
    }),
    ...STICKERS.map((s, index) =>
      sticker(s.x, s.y, s.size, { kind: s.kind, seed: 7 + index }, { rotationDeg: s.tilt }),
    ),
  ];
}

const font = (file: string) => new Uint8Array(readFileSync(path.join(FONTS, file)));
registerFonts([
  { family: 'ArchivoCondensed', bytes: font('Archivo-W62-900.ttf') },
  { family: 'Geist', bytes: font('Geist-600.ttf') },
  { family: 'GeistMono', bytes: font('GeistMono-400.ttf') },
]);

for (const theme of THEMES) {
  const png = await renderCardNode({
    width: WIDTH,
    height: HEIGHT,
    background: theme.background,
    nodes: banner(theme),
  });
  const file = path.join(OUT, theme.name === 'dark' ? 'banner.png' : 'banner-light.png');
  writeFileSync(file, png);
  console.log(`${path.relative(REPO_ROOT, file)}: ${Math.round(png.byteLength / 1024)} KB`);
}
