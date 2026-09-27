import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadManifest } from '../manifest';
import { runPool } from '../pool';
import { expandManifest } from '../render-job';
import type { RenderJob } from '../render-job';

export interface AtlasRect {
  readonly sheet: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Keyed by `${kind}-${form}-${pose}` — Takumi (phase 51) reads this to place a sprite into an OG image. */
export type AtlasIndex = Record<string, AtlasRect>;

export interface OgAtlasResult {
  readonly sheetCount: number;
  readonly spriteCount: number;
  readonly index: AtlasIndex;
}

const MAX_SHEET_WIDTH = 2048;
const MAX_SHEET_HEIGHT = 2048;
const SPRITE_PADDING = 2;

interface Sprite {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

function rarityOf(job: RenderJob): string {
  return job.renderSpec.form?.rarity ?? 'common';
}

function indexKey(job: RenderJob): string {
  return `${job.renderSpec.kind}-${rarityOf(job)}-${job.renderSpec.pose ?? 'idle'}`;
}

/** Packs sprites into row "shelves" (classic shelf bin-packing): sorted tallest-first, each row fills left-to-right up to `MAX_SHEET_WIDTH`, wrapping to a new row/sheet as needed. Simple and deterministic — sprite content never changes packing decisions given the same input set. */
function packShelves(sprites: readonly Sprite[]): {
  sheets: number;
  placements: Map<string, AtlasRect>;
} {
  const sorted = [...sprites].sort((a, b) => b.height - a.height || a.key.localeCompare(b.key));
  const placements = new Map<string, AtlasRect>();

  let sheet = 0;
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const sprite of sorted) {
    if (x + sprite.width > MAX_SHEET_WIDTH) {
      x = 0;
      y += rowHeight + SPRITE_PADDING;
      rowHeight = 0;
    }
    if (y + sprite.height > MAX_SHEET_HEIGHT) {
      sheet += 1;
      x = 0;
      y = 0;
      rowHeight = 0;
    }
    placements.set(sprite.key, { sheet, x, y, w: sprite.width, h: sprite.height });
    x += sprite.width + SPRITE_PADDING;
    rowHeight = Math.max(rowHeight, sprite.height);
  }

  return { sheets: sheet + 1, placements };
}

/**
 * Bakes one or more OG sprite sheet PNGs (`packages/critter-bake/out/og-atlas/sheet-N.png`) plus
 * `atlas.json` (`{kind, form, pose} -> {sheet, x, y, w, h}`) from a manifest of `format: "png"`
 * targets — the atlas Takumi (phase 51) composites `og.render` images from.
 */
export async function writeOgAtlas(
  manifestPath: string,
  cwd: string,
  outDir: string,
  concurrency = 2,
): Promise<OgAtlasResult> {
  const manifest = loadManifest(manifestPath);
  for (const target of manifest.targets) {
    if (target.format !== 'png') {
      throw new Error(`writeOgAtlas: target out="${target.out}" must use format "png"`);
    }
  }

  const jobs = expandManifest(manifest.targets);
  const jobByOutPath = new Map(jobs.map((job) => [job.outPath, job]));
  const outputs = await runPool(jobs, { concurrency });

  const sprites: Sprite[] = [];
  for (const output of outputs) {
    const job = jobByOutPath.get(output.outPath);
    if (!job) continue; // og-atlas targets never use `variant: "blur"`.
    const image = await loadImage(Buffer.from(output.bytes));
    sprites.push({
      key: indexKey(job),
      width: image.width,
      height: image.height,
      bytes: output.bytes,
    });
  }

  const { sheets, placements } = packShelves(sprites);
  const sheetHeights: number[] = Array.from({ length: sheets }, () => 0);
  for (const rect of placements.values()) {
    sheetHeights[rect.sheet] = Math.max(sheetHeights[rect.sheet] ?? 0, rect.y + rect.h);
  }

  const absOutDir = resolve(cwd, outDir);
  mkdirSync(absOutDir, { recursive: true });

  for (let sheet = 0; sheet < sheets; sheet++) {
    const height = sheetHeights[sheet] ?? 0;
    const canvas = createCanvas(MAX_SHEET_WIDTH, Math.max(1, height));
    const ctx = canvas.getContext('2d');
    for (const sprite of sprites) {
      const rect = placements.get(sprite.key);
      if (!rect || rect.sheet !== sheet) continue;
      const image = await loadImage(Buffer.from(sprite.bytes));
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    }
    const bytes = await canvas.encode('png');
    writeFileSync(resolve(absOutDir, `sheet-${sheet}.png`), bytes);
  }

  const index: AtlasIndex = {};
  for (const key of [...placements.keys()].sort()) {
    const rect = placements.get(key);
    if (rect) index[key] = rect;
  }
  writeFileSync(resolve(absOutDir, 'atlas.json'), `${JSON.stringify(index, null, 2)}\n`);

  return { sheetCount: sheets, spriteCount: sprites.length, index };
}
