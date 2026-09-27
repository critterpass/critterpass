/**
 * Contact sheets for review: one row per critter or form, drawn by the same renderer the app and
 * bake use. Each row shows the art and its locked silhouette at 96 pt and 24 pt, on a light and a
 * dark background, with the die-cut sticker (so epic and legendary edges show) and a label.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  build,
  canonicalSeed,
  critters,
  frame,
  layout,
  type FormSpec,
  type RenderSpec,
} from '@cp/critter-art';
import { renderToCanvas, viewportFor, type CanvasLike } from '@cp/critter-art/canvas2d';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

export interface SheetRow {
  readonly critterId: string;
  readonly label: string;
  readonly form?: FormSpec;
}

const LIGHT = '#fffaf0';
const DARK = '#221e3a';
const STICKER = '#fffdf6';
const CELL = 128;
const LABEL_W = 220;
const byId = new Map(critters.map((critter) => [critter.id, critter]));

function napiCanvas(width: number, height: number): CanvasLike {
  return createCanvas(Math.max(1, width), Math.max(1, height)) as unknown as CanvasLike;
}

function draw(ctx: SKRSContext2D, spec: RenderSpec, sizePt: number, x: number, y: number): void {
  const viewport = viewportFor(layout(spec, sizePt), 1);
  const art = renderToCanvas(frame(build(spec, sizePt), 1), viewport, napiCanvas);
  const dx = x + (CELL - viewport.widthPx) / 2;
  const dy = y + (CELL - viewport.heightPx) / 2;
  ctx.drawImage(art as unknown as Parameters<SKRSContext2D['drawImage']>[0], dx, dy);
}

function specFor(row: SheetRow, locked: boolean): RenderSpec {
  const critter = byId.get(row.critterId);
  if (critter === undefined) throw new Error(`unknown critter ${row.critterId}`);
  return {
    kind: critter.kind,
    seed: canonicalSeed(critter),
    sticker: { color: STICKER },
    ...(row.form === undefined
      ? {}
      : { form: row.form, ...(row.form.pose === undefined ? {} : { pose: row.form.pose }) }),
    ...(locked ? { variant: 'mask' as const } : {}),
  };
}

/** Writes one PNG sheet and returns its path. */
export function writeContactSheet(file: string, title: string, rows: readonly SheetRow[]): string {
  const columns = [
    { bg: LIGHT, size: 96, locked: false },
    { bg: LIGHT, size: 96, locked: true },
    { bg: LIGHT, size: 24, locked: false },
    { bg: LIGHT, size: 24, locked: true },
    { bg: DARK, size: 96, locked: false },
    { bg: DARK, size: 96, locked: true },
  ] as const;
  const width = LABEL_W + columns.length * CELL;
  const height = 48 + rows.length * CELL;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#221e19';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(title, 12, 32);
  rows.forEach((row, index) => {
    const y = 48 + index * CELL;
    ctx.fillStyle = '#221e19';
    ctx.font = '15px sans-serif';
    ctx.fillText(row.label, 12, y + CELL / 2, LABEL_W - 16);
    columns.forEach((column, c) => {
      const x = LABEL_W + c * CELL;
      ctx.fillStyle = column.bg;
      ctx.fillRect(x, y, CELL, CELL);
      draw(ctx, specFor(row, column.locked), column.size, x, y);
    });
  });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}
