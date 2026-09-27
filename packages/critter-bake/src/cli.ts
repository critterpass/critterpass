import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeArtVersion, saveHashCache, sha256Hex } from './hash-cache';
import { loadManifest } from './manifest';
import { runPool } from './pool';
import { expandManifest } from './render-job';

export interface CliOptions {
  readonly manifestPath: string;
  readonly only: string | undefined;
  readonly check: boolean;
  readonly concurrency: number;
  readonly cwd: string;
}

export function parseArgs(argv: readonly string[], cwd = process.cwd()): CliOptions {
  let manifestPath: string | undefined;
  let only: string | undefined;
  let check = false;
  let concurrency = 2;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest') manifestPath = argv[++i];
    else if (arg === '--only') only = argv[++i];
    else if (arg === '--check') check = true;
    else if (arg === '--concurrency') {
      const value = argv[++i];
      if (value !== undefined) concurrency = Number(value);
    }
  }

  if (!manifestPath) throw new Error('critter-bake: --manifest <file> is required');
  return { manifestPath: resolve(cwd, manifestPath), only, check, concurrency, cwd };
}

export interface BakeResult {
  readonly totalOutputs: number;
  readonly written: number;
  readonly unchanged: number;
  readonly staleOutPaths: readonly string[];
}

/**
 * Runs one bake: expands the manifest, renders every job across the worker pool, then either
 * writes changed files and updates the hash cache (default) or only reports staleness without
 * touching disk (`options.check`, for CI).
 */
export async function bake(options: CliOptions): Promise<BakeResult> {
  const manifest = loadManifest(options.manifestPath);
  const jobs = expandManifest(manifest.targets).filter((job) =>
    options.only ? job.outPath.includes(options.only) : true,
  );

  const cachePath = resolve(dirname(options.manifestPath), '.critter-bake-cache.json');
  const artVersion = computeArtVersion(options.manifestPath);

  const outputs = await runPool(jobs, { concurrency: options.concurrency });

  let written = 0;
  let unchanged = 0;
  const staleOutPaths: string[] = [];
  const nextEntries: Record<string, string> = {};

  // Staleness/unchanged is decided by comparing the freshly rendered bytes against what is
  // actually on disk right now (not the cache) — the cache alone can't catch a file that was
  // hand-edited or deleted outside this CLI; the content-hash manifest it writes is a record of
  // this run's outputs for other tooling, not the source of truth for this run's own decisions.
  for (const output of outputs) {
    const hash = sha256Hex(output.bytes);
    const absPath = resolve(options.cwd, output.outPath);
    const onDiskHash = existsSync(absPath) ? sha256Hex(readFileSync(absPath)) : undefined;
    const upToDate = onDiskHash === hash;
    nextEntries[output.outPath] = hash;

    if (options.check) {
      if (!upToDate) staleOutPaths.push(output.outPath);
      continue;
    }

    if (upToDate) {
      unchanged++;
      continue;
    }
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, output.bytes);
    written++;
  }

  if (!options.check) {
    saveHashCache(cachePath, { artVersion, entries: nextEntries });
  }

  return { totalOutputs: outputs.length, written, unchanged, staleOutPaths };
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await bake(options);

  if (options.check) {
    if (result.staleOutPaths.length > 0) {
      console.error(
        `critter-bake --check: ${result.staleOutPaths.length} stale output(s):\n${result.staleOutPaths
          .map((p) => `  ${p}`)
          .join('\n')}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`critter-bake --check: ${result.totalOutputs} output(s), all up to date.`);
    return;
  }

  console.log(
    `critter-bake: ${result.totalOutputs} output(s), ${result.written} written, ${result.unchanged} unchanged.`,
  );
}

// Only auto-run when invoked as the CLI entry (`tsx src/cli.ts ...`), never on import (tests import
// `bake`/`parseArgs` directly).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
