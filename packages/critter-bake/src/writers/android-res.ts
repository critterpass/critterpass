import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RenderJob, RenderOutput } from '../render-job';

/** Android's standard density buckets, keyed by the device-scale factor a manifest's `scales` array would use (mdpi = 1x). */
const DENSITY_BY_SCALE: Readonly<Record<number, string>> = {
  0.75: 'ldpi',
  1: 'mdpi',
  1.5: 'hdpi',
  2: 'xhdpi',
  3: 'xxhdpi',
  4: 'xxxhdpi',
};

function drawableName(job: RenderJob, stageSuffix: string): string {
  const rarity = job.renderSpec.form?.rarity ?? 'common';
  const pose = job.renderSpec.pose ?? 'idle';
  // Android resource names must be lowercase snake_case with no punctuation beyond `_`.
  return `critter_${job.renderSpec.kind}_${rarity}_${pose}_${job.variant}_${job.sizePt}pt${stageSuffix}`
    .replace(/[^a-z0-9_]/gi, '_')
    .toLowerCase();
}

/** Extracts a blur job's `-stageN` suffix from one of its (differently-named) outputs, or `''` for a job whose single output keeps its own `outPath`. */
function stageSuffixOf(job: RenderJob, output: RenderOutput): string {
  if (output.outPath === job.outPath) return '';
  const match = /(-stage\d+)\.[a-z-]+$/.exec(output.outPath);
  return match?.[1] ?? '';
}

export interface AndroidResFile {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

/** Maps a bake run's outputs to `drawable-<density>/<name>.png` files, skipping scales with no defined Android density bucket. A `variant: 'blur'` job's stage outputs each get their own distinct filename. */
export function buildAndroidResFiles(
  jobs: readonly RenderJob[],
  outputs: readonly RenderOutput[],
): AndroidResFile[] {
  const jobByOutPath = new Map(jobs.map((job) => [job.outPath, job]));
  const files: AndroidResFile[] = [];

  for (const output of outputs) {
    const job = jobByOutPath.get(output.sourceJobOutPath);
    if (!job) continue;
    const density = DENSITY_BY_SCALE[job.scale];
    if (!density) continue;
    files.push({
      relativePath: `drawable-${density}/${drawableName(job, stageSuffixOf(job, output))}.png`,
      bytes: output.bytes,
    });
  }

  return files;
}

/** Writes every `buildAndroidResFiles` entry under `resDir` (an Android `res/` directory). */
export function writeAndroidRes(resDir: string, files: readonly AndroidResFile[]): void {
  for (const file of files) {
    const destPath = resolve(resDir, file.relativePath);
    mkdirSync(resolve(destPath, '..'), { recursive: true });
    writeFileSync(destPath, file.bytes);
  }
}
