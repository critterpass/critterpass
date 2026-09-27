/**
 * Where a batch lives on disk. `work/<kind>/` (git-ignored) holds the generation cache and each
 * batch's intermediate stage files; `batches/<kind>/<batch>.json` (committed) is the reviewed
 * artifact a batch produces, so any environment can queue the same batch for review.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import type { ContentKind } from '@cp/content';

export const FACTORY_DIR = path.resolve(import.meta.dirname, '..');
export const REPO_DIR = path.resolve(FACTORY_DIR, '..', '..');

export interface BatchPaths {
  readonly kind: ContentKind;
  readonly batchKey: string;
  /** work/<kind>/<batch>/ */
  readonly dir: string;
  /** work/<kind>/cache/: generation outputs by content hash, shared by every batch of the kind. */
  readonly cacheDir: string;
  /** batches/<kind>/<batch>.json */
  readonly artifact: string;
}

export function batchPaths(kind: ContentKind, batchKey: string, root = FACTORY_DIR): BatchPaths {
  return {
    kind,
    batchKey,
    dir: path.join(root, 'work', kind, batchKey),
    cacheDir: path.join(root, 'work', kind, 'cache'),
    artifact: path.join(root, 'batches', kind, `${batchKey}.json`),
  };
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readJsonIfExists<T>(file: string): T | undefined {
  return existsSync(file) ? readJson<T>(file) : undefined;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}
