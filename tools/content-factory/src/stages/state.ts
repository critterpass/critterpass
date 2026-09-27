/**
 * A batch's stage files under work/<kind>/<batch>/: brief.json → outputs.json → items.json +
 * report.json (+ ip.json) → renders.json. Each stage reads the previous stage's file, so any stage
 * can be re-run on its own and a run resumes where it stopped.
 */
import path from 'node:path';

import type { ContentKind } from '@cp/content';

import type { CostTotals } from '../cost';
import type { IpResult } from '../ip/check';
import type { Brief, RenderedItem } from '../kinds/types';
import type { BatchReport } from '../validators/registry';
import { batchPaths, readJsonIfExists, writeJson, type BatchPaths } from '../work';

export interface GenerateLog {
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly cost: CostTotals;
  readonly agentJobId: string | null;
}

export interface StageFiles {
  readonly paths: BatchPaths;
  brief(): Brief | undefined;
  generate(): GenerateLog | undefined;
  items(): readonly unknown[] | undefined;
  report(): BatchReport | undefined;
  ip(): readonly IpResult[] | undefined;
  renders(): readonly RenderedItem[] | undefined;
  write(stage: 'brief' | 'generate' | 'items' | 'report' | 'ip' | 'renders', value: unknown): void;
}

export function stageFiles(kind: ContentKind, batchKey: string, root?: string): StageFiles {
  const paths = batchPaths(kind, batchKey, root);
  const file = (name: string) => path.join(paths.dir, `${name}.json`);
  return {
    paths,
    brief: () => readJsonIfExists<Brief>(file('brief')),
    generate: () => readJsonIfExists<GenerateLog>(file('generate')),
    items: () => readJsonIfExists<unknown[]>(file('items')),
    report: () => readJsonIfExists<BatchReport>(file('report')),
    ip: () => readJsonIfExists<IpResult[]>(file('ip')),
    renders: () => readJsonIfExists<RenderedItem[]>(file('renders')),
    write: (stage, value) => writeJson(file(stage), value),
  };
}

export class StageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageError';
  }
}

export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new StageError(`${what} is missing: run the earlier stage first`);
  return value;
}
