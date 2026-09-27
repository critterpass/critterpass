export type {
  BakeCrop,
  BakeFormat,
  BakeManifest,
  BakePose,
  BakeTarget,
  BakeVariant,
  RarityForm,
} from './manifest';
export { bakeManifestSchema, bakeTargetSchema, loadManifest } from './manifest';

export type { RenderJob, RenderOutput } from './render-job';
export { expandManifest, renderJob } from './render-job';

export { encodeCanvas } from './encode';

export type { HashCache } from './hash-cache';
export { computeArtVersion, loadHashCache, saveHashCache, sha256Hex } from './hash-cache';

export type { PoolOptions } from './pool';
export { runPool } from './pool';

export type { BakeResult, CliOptions } from './cli';
export { bake, parseArgs } from './cli';
