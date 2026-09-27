import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { loadManifest } from '../manifest';
import { runPool } from '../pool';
import { expandManifest } from '../render-job';
import type { RenderJob } from '../render-job';

export interface SrcsetEntry {
  readonly sizePt: number;
  readonly scale: number;
  readonly url: string;
}

/** Keyed by `${kind}-${rarity}-${pose}`, entries sorted by size then scale. */
export type SrcsetIndex = Record<string, SrcsetEntry[]>;

export interface WebWebpResult {
  readonly fileCount: number;
  readonly index: SrcsetIndex;
}

function rarityOf(job: RenderJob): string {
  return job.renderSpec.form?.rarity ?? 'common';
}

function indexKey(job: RenderJob): string {
  return `${job.renderSpec.kind}-${rarityOf(job)}-${job.renderSpec.pose ?? 'idle'}`;
}

/**
 * Bakes `apps/web/public/critters/<kind>-<form>-<pose>-<variant>-<size>pt@<scale>x.webp` from a
 * manifest of `format: "webp"` targets, plus a `srcset.json` index (`{kind, form, pose} ->
 * [{sizePt, scale, url}]`) for the `<critter-sticker>` element's static fallback and `<img
 * srcset>` no-JS path.
 */
export async function writeWebWebp(
  manifestPath: string,
  cwd: string,
  concurrency = 2,
): Promise<WebWebpResult> {
  const manifest = loadManifest(manifestPath);
  for (const target of manifest.targets) {
    if (target.format !== 'webp') {
      throw new Error(`writeWebWebp: target out="${target.out}" must use format "webp"`);
    }
  }

  const jobs = expandManifest(manifest.targets);
  const jobByOutPath = new Map(jobs.map((job) => [job.outPath, job]));
  const outputs = await runPool(jobs, { concurrency });

  const index: SrcsetIndex = {};
  let fileCount = 0;
  let outDir: string | undefined;

  for (const output of outputs) {
    const job = jobByOutPath.get(output.outPath);
    if (!job) continue; // web-webp targets never use `variant: "blur"`, so every output maps 1:1 to a job.

    const absPath = resolve(cwd, output.outPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, output.bytes);
    fileCount++;
    outDir ??= dirname(absPath);

    const key = indexKey(job);
    const entries = (index[key] ??= []);
    entries.push({
      sizePt: job.sizePt,
      scale: job.scale,
      url: `/critters/${basename(output.outPath)}`,
    });
  }

  for (const entries of Object.values(index)) {
    entries.sort((a, b) => a.sizePt - b.sizePt || a.scale - b.scale);
  }

  if (outDir) {
    const sortedIndex: SrcsetIndex = {};
    for (const key of Object.keys(index).sort()) {
      const entries = index[key];
      if (entries) sortedIndex[key] = entries;
    }
    writeFileSync(resolve(outDir, 'srcset.json'), `${JSON.stringify(sortedIndex, null, 2)}\n`);
  }

  return { fileCount, index };
}
