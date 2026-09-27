import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RenderJob } from '../render-job';
import { imagesetName } from './xcassets';

/** `<kind>-<form>-<pose>-<mode>@<scale>` -> the bundled `.xcassets` imageset name the App Group writer's native code loads via `UIImage(named:)`. */
export type AppGroupKeyIndex = Readonly<Record<string, string>>;

// Does not include `sizePt`: `docs/api-contracts-async.md` §6's own key format
// (`assets/critters/<form>-<pose>-<mode>.png`) has no size component either, so multiple sizePt
// jobs for the same (kind, rarity, pose, variant, scale) already collide on this key today — which
// one wins depends on `runPool`'s worker-completion order. Not fixed here: unlike the `crop`
// collision below (unambiguously two different images), it's not clear whether the real contract
// wants one canonical size per key (and if so, which) or a size-qualified key — a decision for
// whoever owns the App Group asset consumers, not a guess this pipeline should make.
function appGroupKey(job: RenderJob): string {
  const rarity = job.renderSpec.form?.rarity ?? 'common';
  const pose = job.renderSpec.pose ?? 'idle';
  const cropSuffix = job.crop === 'none' ? '' : `-${job.crop}`;
  return `${job.renderSpec.kind}-${rarity}-${pose}-${job.variant}${cropSuffix}@${job.scale}x`;
}

/** Builds the App Group asset key -> bundled imageset name index for every `@2x`/`@3x` job. */
export function buildAppGroupKeyIndex(jobs: readonly RenderJob[]): AppGroupKeyIndex {
  const index: Record<string, string> = {};
  for (const job of jobs) {
    if (job.scale !== 2 && job.scale !== 3) continue;
    index[appGroupKey(job)] = imagesetName(job);
  }
  return index;
}

/** Writes the key index as `app-group-keys.json`, sorted for a stable diff. */
export function writeAppGroupKeyIndex(destPath: string, index: AppGroupKeyIndex): void {
  mkdirSync(resolve(destPath, '..'), { recursive: true });
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(index).sort()) {
    const value = index[key];
    if (value !== undefined) sorted[key] = value;
  }
  writeFileSync(destPath, `${JSON.stringify(sorted, null, 2)}\n`);
}
