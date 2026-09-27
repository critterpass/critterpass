import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RenderJob } from '../render-job';
import { imagesetName } from './xcassets';

/** `<kind>-<form>-<pose>-<mode>@<scale>` -> the bundled `.xcassets` imageset name the App Group writer's native code loads via `UIImage(named:)`. */
export type AppGroupKeyIndex = Readonly<Record<string, string>>;

function appGroupKey(job: RenderJob): string {
  const rarity = job.renderSpec.form?.rarity ?? 'common';
  const pose = job.renderSpec.pose ?? 'idle';
  return `${job.renderSpec.kind}-${rarity}-${pose}-${job.variant}@${job.scale}x`;
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
