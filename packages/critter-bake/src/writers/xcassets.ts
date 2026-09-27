import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RenderJob, RenderOutput } from '../render-job';

export interface XcassetImageVariant {
  readonly scale: 2 | 3;
  readonly bytes: Uint8Array;
}

export interface XcassetImageset {
  readonly name: string;
  readonly variants: readonly XcassetImageVariant[];
  /** iOS renders this imageset as a template (single-colour mask) — set for the `mask` variant so widget/lock-screen tinting works. */
  readonly template: boolean;
}

/** Writes one `<name>.imageset` folder: `Contents.json` plus `@2x`/`@3x` PNGs — `1x` is never emitted (every supported device is at least `@2x`). */
function writeImageset(catalogDir: string, imageset: XcassetImageset): void {
  const dir = resolve(catalogDir, `${imageset.name}.imageset`);
  mkdirSync(dir, { recursive: true });

  const images = [...imageset.variants]
    .sort((a, b) => a.scale - b.scale)
    .map((variant) => {
      const filename = `${imageset.name}@${variant.scale}x.png`;
      writeFileSync(resolve(dir, filename), variant.bytes);
      return { filename, idiom: 'universal', scale: `${variant.scale}x` };
    });

  const contents: Record<string, unknown> = {
    images,
    info: { author: 'xcode', version: 1 },
  };
  if (imageset.template) {
    contents.properties = { 'template-rendering-intent': 'template' };
  }
  writeFileSync(resolve(dir, 'Contents.json'), `${JSON.stringify(contents, null, 2)}\n`);
}

/** Writes a full `.xcassets` catalog (root `Contents.json` plus every imageset) at `catalogDir`. */
export function writeXcassetCatalog(
  catalogDir: string,
  imagesets: readonly XcassetImageset[],
): void {
  mkdirSync(catalogDir, { recursive: true });
  writeFileSync(
    resolve(catalogDir, 'Contents.json'),
    `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
  );
  for (const imageset of [...imagesets].sort((a, b) => a.name.localeCompare(b.name))) {
    writeImageset(catalogDir, imageset);
  }
}

/**
 * The `.imageset` name a job's `@2x`/`@3x` outputs share — also the `UIImage(named:)` lookup key at
 * runtime, so `app-group-keys.ts` reuses this. Includes `crop` (when not `'none'`) because two
 * manifest targets can otherwise describe the same (kind, rarity, pose, variant, sizePt) with a
 * different crop — tier-a.json's `guides` (crop `none`) and `notification-avatars` (crop `face`)
 * both produce a `gecko-common-idle-color-48pt` job — and without this, `buildImagesets` would
 * silently let one crop's bytes overwrite the other's under the same name, non-deterministically
 * (whichever the worker pool happened to finish last). Found and fixed while sampling real baked
 * output for the PNG-optimization pass, not a guess.
 */
export function imagesetName(job: RenderJob): string {
  const rarity = job.renderSpec.form?.rarity ?? 'common';
  const pose = job.renderSpec.pose ?? 'idle';
  const cropSuffix = job.crop === 'none' ? '' : `-${job.crop}`;
  return `${job.renderSpec.kind}-${rarity}-${pose}-${job.variant}-${job.sizePt}pt${cropSuffix}`;
}

/** Extracts a blur job's `-stageN` suffix from one of its (differently-named) outputs, or `''` for a job whose single output keeps its own `outPath`. */
function stageSuffix(job: RenderJob, output: RenderOutput): string {
  if (output.outPath === job.outPath) return '';
  const match = /(-stage\d+)\.[a-z-]+$/.exec(output.outPath);
  return match?.[1] ?? '';
}

/**
 * Groups a bake run's outputs into imagesets by everything except device scale (`@2x`/`@3x` become
 * one imageset's two variants), skipping any `1x` outputs a manifest might still produce. A
 * `variant: 'blur'` job's several stage outputs each become their own imageset (they're distinct
 * images, not scale variants of one image); `variant: 'mask'` imagesets render as templates.
 */
export function buildImagesets(
  jobs: readonly RenderJob[],
  outputs: readonly RenderOutput[],
): XcassetImageset[] {
  const jobByOutPath = new Map(jobs.map((job) => [job.outPath, job]));
  const byName = new Map<
    string,
    { readonly template: boolean; readonly variants: XcassetImageVariant[] }
  >();

  for (const output of outputs) {
    const job = jobByOutPath.get(output.sourceJobOutPath);
    if (!job || (job.scale !== 2 && job.scale !== 3)) continue;
    const name = `${imagesetName(job)}${stageSuffix(job, output)}`;
    const entry = byName.get(name) ?? { template: job.variant === 'mask', variants: [] };
    entry.variants.push({ scale: job.scale, bytes: output.bytes });
    byName.set(name, entry);
  }

  return [...byName.entries()].map(([name, entry]) => ({ name, ...entry }));
}
