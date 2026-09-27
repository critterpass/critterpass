/**
 * Runs pipeline stages for one batch: brief → generate → validate → render → review. `run` does all
 * of them; `resume` skips the brief so an interrupted generation continues from its cache.
 * `validate --all` re-checks every committed batch artifact of a kind without the model.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Gateway } from '@cp/ai';
import { loadRelease, type ContentKind } from '@cp/content';
import type pg from 'pg';

import { liveArtifact, ensureAgentJob, rejectionNotes } from './db';
import { kindModule } from './kinds/registry';
import type { KindContext } from './kinds/types';
import { runBrief } from './stages/brief';
import { runGenerate } from './stages/generate';
import { runRender } from './stages/render';
import { runReview, type QueuedBatch } from './stages/review';
import { stageFiles } from './stages/state';
import { runValidate } from './stages/validate';
import { runValidators, type BatchReport } from './validators/registry';
import { FACTORY_DIR, writeText } from './work';

export const STAGES = ['brief', 'generate', 'validate', 'render', 'review'] as const;
export type Stage = (typeof STAGES)[number];

export interface PipelineOptions {
  readonly kind: ContentKind;
  readonly batchKey: string;
  readonly stages: readonly Stage[];
  readonly pool: pg.Pool | null;
  readonly gateway: Gateway | null;
  readonly now?: Date;
  readonly options?: Readonly<Record<string, string>>;
  readonly maxCostMicros?: number;
  readonly concurrency?: number;
  readonly root?: string;
  readonly log?: (line: string) => void;
}

export interface PipelineResult {
  readonly report: BatchReport | undefined;
  readonly queued: QueuedBatch | undefined;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const module = kindModule(opts.kind);
  const ctx: KindContext = {
    batchKey: opts.batchKey,
    now: opts.now ?? new Date(),
    options: opts.options ?? {},
  };
  const files = stageFiles(opts.kind, opts.batchKey, opts.root);
  const log = opts.log ?? (() => undefined);
  writeText(path.join(path.dirname(files.paths.dir), 'latest'), opts.batchKey);
  let report: BatchReport | undefined;
  let queued: QueuedBatch | undefined;
  for (const stage of opts.stages) {
    switch (stage) {
      case 'brief': {
        const notes = opts.pool === null ? {} : await rejectionNotes(opts.pool, opts.kind);
        await runBrief(module, ctx, files, notes, log);
        break;
      }
      case 'generate': {
        const agentJobId =
          opts.pool === null || module.prompt === undefined
            ? null
            : await ensureAgentJob(opts.pool, opts.batchKey);
        await runGenerate(module, ctx, files, {
          gateway: opts.gateway,
          agentJobId,
          log,
          ...(opts.maxCostMicros === undefined ? {} : { maxCostMicros: opts.maxCostMicros }),
          ...(opts.concurrency === undefined ? {} : { concurrency: opts.concurrency }),
        });
        break;
      }
      case 'validate': {
        const previous = opts.pool === null ? undefined : await liveArtifact(opts.pool, opts.kind);
        const items = previous === undefined ? [] : loadRelease(previous, opts.kind).items;
        report = (await runValidate(module, ctx, files, items, log)).report;
        break;
      }
      case 'render':
        await runRender(module, ctx, files, log);
        break;
      case 'review':
        queued = await runReview(module, ctx, files, opts.pool, log);
        break;
    }
  }
  return { report, queued };
}

/** The batch key a new run gets: `<date>-<kind>-<nn>`, the first one not used yet. */
export function nextBatchKey(kind: ContentKind, now: Date, root = FACTORY_DIR): string {
  const date = now.toISOString().slice(0, 10);
  for (let n = 1; ; n += 1) {
    const key = `${date}-${kind.replace(/_/gu, '-')}-${String(n).padStart(2, '0')}`;
    const used =
      existsSync(path.join(root, 'work', kind, key)) ||
      existsSync(path.join(root, 'batches', kind, `${key}.json`));
    if (!used) return key;
  }
}

export function latestBatchKey(kind: ContentKind, root = FACTORY_DIR): string | undefined {
  const file = path.join(root, 'work', kind, 'latest');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const dir = path.join(root, 'batches', kind);
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort()
    .at(-1);
}

/** Every committed batch artifact of a kind: checksum, schema and validators, no model calls. */
export function validateCommitted(
  kind: ContentKind,
  root = FACTORY_DIR,
): { batchKey: string; report: BatchReport }[] {
  const dir = path.join(root, 'batches', kind);
  if (!existsSync(dir)) return [];
  const module = kindModule(kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw: unknown = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      const release = loadRelease(raw, kind);
      return {
        batchKey: f.slice(0, -5),
        report: runValidators(kind, release.items, module.validators),
      };
    });
}
