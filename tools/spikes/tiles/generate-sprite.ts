import { createCanvas } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Draws the tiles-spike sprite sheet with real Skia rendering (@napi-rs/canvas, the same binding
 * `skia-critter` uses for its Node reference renderer) — two icons used by the Da Nang dark style
 * draft: a faint grid tile (background texture, drawn as a `fill-pattern`) and a small critter-paw
 * marker (POI icon). Run at 1x and 2x pixel ratios; MapLibre style specs load `sprite.json` +
 * `sprite.png` and, on Retina screens, `sprite@2x.json` + `sprite@2x.png`.
 */
const NAVY = '#120f22';
const GRID_LINE = 'rgba(216, 211, 238, 0.08)'; // ink/100 at low alpha — "faint grid"
const PAW_FILL = '#f4efe4'; // paper/base

interface SpriteIcon {
  name: string;
  width: number;
  height: number;
  draw: (ctx: SKRSContext2D, scale: number) => void;
}

const ICONS: SpriteIcon[] = [
  {
    name: 'grid-tile',
    width: 32,
    height: 32,
    draw: (ctx, scale) => {
      ctx.fillStyle = NAVY;
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
  {
    name: 'critter-paw',
    width: 24,
    height: 24,
    draw: (ctx, scale) => {
      const c = 12 * scale;
      ctx.fillStyle = PAW_FILL;
      ctx.beginPath();
      ctx.ellipse(c, c + 3 * scale, 6 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      const toePositions: Array<[number, number]> = [
        [-6, -6],
        [-2.2, -8.5],
        [2.2, -8.5],
        [6, -6],
      ];
      for (const [dx, dy] of toePositions) {
        ctx.beginPath();
        ctx.ellipse(c + dx * scale, c + dy * scale, 2.2 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
];

function buildAtScale(scale: number): { png: Buffer; json: Record<string, unknown> } {
  const totalWidth = ICONS.reduce((sum, icon) => sum + icon.width, 0) * scale;
  const maxHeight = Math.max(...ICONS.map((icon) => icon.height)) * scale;
  const canvas = createCanvas(totalWidth, maxHeight);
  const ctx = canvas.getContext('2d');

  const json: Record<string, unknown> = {};
  let x = 0;
  for (const icon of ICONS) {
    ctx.save();
    ctx.translate(x, 0);
    icon.draw(ctx, scale);
    ctx.restore();
    json[icon.name] = {
      x,
      y: 0,
      width: icon.width * scale,
      height: icon.height * scale,
      pixelRatio: scale,
    };
    x += icon.width * scale;
  }
  return { png: canvas.toBuffer('image/png'), json };
}

function main(): void {
  const outDir = join(process.cwd(), 'tiles', '.output', 'sprite');
  mkdirSync(outDir, { recursive: true });

  for (const [suffix, scale] of [['', 1] as const, ['@2x', 2] as const]) {
    const { png, json } = buildAtScale(scale);
    writeFileSync(join(outDir, `sprite${suffix}.png`), png);
    writeFileSync(join(outDir, `sprite${suffix}.json`), JSON.stringify(json, null, 2));
  }
  console.log(JSON.stringify({ msg: 'tiles sprite: written', outDir, icons: ICONS.length }));
}

main();
