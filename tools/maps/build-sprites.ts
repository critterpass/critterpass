/**
 * Draws the map sprite sheet with real Skia rendering (`@napi-rs/canvas`, the same binding
 * `packages/critter-art` uses for its Node reference renderer): a faint background grid tile
 * (`build-style.ts`'s `background-pattern`) and one hand-drawn doodle icon per
 * `@cp/domain`'s `POI_CATEGORIES` (F-031 "doodle sprite sheet... else category icons" fallback —
 * no P04 critter-art asset exists for map pin icons, so these are drawn directly from the fixed
 * taxonomy rather than left unbuilt). Generalises `tools/spikes/tiles/generate-sprite.ts`'s
 * technique (real Skia primitives, 1x/2x) from two hard-coded icons to the full icon set
 * `CATEGORY_ICON_KEYS` names, plus the icons the map UI needs beyond POI categories.
 */
import { tokens } from '@cp/design-tokens';
import { CATEGORY_ICON_KEYS, POI_CATEGORIES, type PoiCategory } from '@cp/domain';
import { createCanvas } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const NAVY = '#120f22';
const GRID_LINE = 'rgba(216, 211, 238, 0.08)'; // ink/100 at low alpha — "faint grid"
const PAPER = '#f4efe4'; // paper/base — icon fill
const INK = '#211d18'; // paper/ink — icon stroke

interface SpriteIcon {
  readonly name: string;
  readonly size: number;
  readonly draw: (ctx: SKRSContext2D, scale: number) => void;
}

/** One simple, recognisable doodle per category — same drawing complexity as the tiles spike's
 *  critter-paw icon, not full critter-art illustration. */
const CATEGORY_DRAWERS: Readonly<Record<PoiCategory, (ctx: SKRSContext2D, s: number) => void>> = {
  temple_shrine: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(12 * s, 2 * s);
    ctx.lineTo(21 * s, 10 * s);
    ctx.lineTo(3 * s, 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(5 * s, 11 * s, 14 * s, 3 * s);
    ctx.fillRect(8 * s, 15 * s, 8 * s, 7 * s);
  },
  food: (ctx, s) => {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(7 * s, 3 * s);
    ctx.lineTo(7 * s, 21 * s);
    ctx.moveTo(4 * s, 3 * s);
    ctx.lineTo(4 * s, 9 * s);
    ctx.moveTo(10 * s, 3 * s);
    ctx.lineTo(10 * s, 9 * s);
    ctx.moveTo(4 * s, 9 * s);
    ctx.quadraticCurveTo(7 * s, 12 * s, 10 * s, 9 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(17 * s, 6 * s, 3 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.moveTo(17 * s, 10 * s);
    ctx.lineTo(17 * s, 21 * s);
    ctx.stroke();
  },
  market: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(4 * s, 9 * s);
    ctx.lineTo(20 * s, 9 * s);
    ctx.lineTo(18 * s, 21 * s);
    ctx.lineTo(6 * s, 21 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(12 * s, 6 * s, 5 * s, Math.PI, 0);
    ctx.stroke();
  },
  nature: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(12 * s, 2 * s);
    ctx.quadraticCurveTo(22 * s, 8 * s, 12 * s, 22 * s);
    ctx.quadraticCurveTo(2 * s, 8 * s, 12 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(12 * s, 4 * s);
    ctx.lineTo(12 * s, 20 * s);
    ctx.stroke();
  },
  beach: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(8 * s, 8 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(2 * s, 16 * s);
    ctx.quadraticCurveTo(7 * s, 12 * s, 12 * s, 16 * s);
    ctx.quadraticCurveTo(17 * s, 20 * s, 22 * s, 16 * s);
    ctx.moveTo(2 * s, 21 * s);
    ctx.quadraticCurveTo(7 * s, 17 * s, 12 * s, 21 * s);
    ctx.quadraticCurveTo(17 * s, 25 * s, 22 * s, 21 * s);
    ctx.stroke();
  },
  museum: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(12 * s, 2 * s);
    ctx.lineTo(22 * s, 8 * s);
    ctx.lineTo(2 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(4 * s, 10 * s, 3 * s, 10 * s);
    ctx.fillRect(10.5 * s, 10 * s, 3 * s, 10 * s);
    ctx.fillRect(17 * s, 10 * s, 3 * s, 10 * s);
    ctx.fillRect(2 * s, 21 * s, 20 * s, 2 * s);
  },
  nightlife: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(13 * s, 12 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(16 * s, 9 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    for (const [dx, dy] of [
      [6, 5],
      [9, 3],
    ] as const) {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s, 1.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  shopping: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(4 * s, 9 * s, 16 * s, 12 * s);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(12 * s, 8 * s, 4 * s, Math.PI, 0);
    ctx.stroke();
  },
  transit: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(4 * s, 4 * s, 16 * s, 13 * s);
    ctx.fillStyle = NAVY;
    ctx.fillRect(6 * s, 6 * s, 12 * s, 5 * s);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(8 * s, 19 * s, 2 * s, 0, Math.PI * 2);
    ctx.arc(16 * s, 19 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
  },
  stay: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(3 * s, 14 * s, 18 * s, 6 * s);
    ctx.fillRect(3 * s, 9 * s, 6 * s, 5 * s);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(3 * s, 14 * s);
    ctx.lineTo(3 * s, 20 * s);
    ctx.moveTo(21 * s, 14 * s);
    ctx.lineTo(21 * s, 20 * s);
    ctx.stroke();
  },
  health: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(9 * s, 3 * s, 6 * s, 18 * s);
    ctx.fillRect(3 * s, 9 * s, 18 * s, 6 * s);
  },
  other: (ctx, s) => {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(12 * s, 12 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(12 * s, 12 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  },
};

function categoryIcons(): SpriteIcon[] {
  return POI_CATEGORIES.map((category) => ({
    name: CATEGORY_ICON_KEYS[category],
    size: 24,
    draw: (ctx, scale) => CATEGORY_DRAWERS[category](ctx, scale),
  }));
}

const STATIC_ICONS: readonly SpriteIcon[] = [
  {
    name: 'grid-tile',
    size: 32,
    draw: (ctx, scale) => {
      ctx.fillStyle = tokens.color.map.base;
      ctx.fillRect(0, 0, 32 * scale, 32 * scale);
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1 * scale;
      ctx.beginPath();
      ctx.moveTo(0, 32 * scale - 0.5 * scale);
      ctx.lineTo(32 * scale, 32 * scale - 0.5 * scale);
      ctx.moveTo(32 * scale - 0.5 * scale, 0);
      ctx.lineTo(32 * scale - 0.5 * scale, 32 * scale);
      ctx.stroke();
    },
  },
];

function allIcons(): SpriteIcon[] {
  return [...STATIC_ICONS, ...categoryIcons()];
}

function buildAtScale(icons: readonly SpriteIcon[], scale: number) {
  const totalWidth = icons.reduce((sum, icon) => sum + icon.size, 0) * scale;
  const maxHeight = Math.max(...icons.map((icon) => icon.size)) * scale;
  const canvas = createCanvas(totalWidth, maxHeight);
  const ctx = canvas.getContext('2d');

  const json: Record<string, unknown> = {};
  let x = 0;
  for (const icon of icons) {
    ctx.save();
    ctx.translate(x, 0);
    icon.draw(ctx, scale);
    ctx.restore();
    json[icon.name] = {
      x,
      y: 0,
      width: icon.size * scale,
      height: icon.size * scale,
      pixelRatio: scale,
    };
    x += icon.size * scale;
  }
  return { png: canvas.toBuffer('image/png'), json };
}

export function buildSprites(outDir: string): { readonly icons: number } {
  mkdirSync(outDir, { recursive: true });
  const icons = allIcons();
  for (const [suffix, scale] of [['', 1] as const, ['@2x', 2] as const]) {
    const { png, json } = buildAtScale(icons, scale);
    writeFileSync(path.join(outDir, `sprite${suffix}.png`), png);
    writeFileSync(path.join(outDir, `sprite${suffix}.json`), JSON.stringify(json, null, 2));
  }
  return { icons: icons.length };
}

function main(): void {
  const outDir = path.resolve(import.meta.dirname, '.output/sprite');
  const { icons } = buildSprites(outDir);
  console.log(JSON.stringify({ msg: 'tiles sprite: written', outDir, icons }));
}

if (import.meta.main) main();
