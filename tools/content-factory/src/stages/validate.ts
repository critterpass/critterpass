/**
 * Validate stage: assembles the release items from the brief and generation outputs, runs the
 * kind's validators (schema first) and the IP screen, and writes items.json, report.json and, for
 * named kinds, ip.json plus the owner's checklist. A `fail` anywhere keeps the batch out of review.
 */
import path from 'node:path';

import { parseItems, type ContentItem, type ContentKind } from '@cp/content';

import { checkName, ipChecklist, type IpResult } from '../ip/check';
import type { AnyKindModule, KindContext } from '../kinds/types';
import { runValidators, type BatchReport } from '../validators/registry';
import { writeText } from '../work';
import { required, type StageFiles } from './state';

export interface ValidateResult {
  readonly report: BatchReport;
  readonly ip: readonly IpResult[];
}

export async function runValidate(
  module: AnyKindModule,
  ctx: KindContext,
  files: StageFiles,
  previous: readonly unknown[] = [],
  log: (line: string) => void = () => undefined,
): Promise<ValidateResult> {
  const brief = required(files.brief(), 'brief');
  const generated = files.generate();
  const outputs = new Map(Object.entries(generated?.outputs ?? {}));
  const missing = module.prompt === undefined ? [] : brief.units.filter((u) => !outputs.has(u.id));
  const items = await module.assemble(ctx, brief, outputs);
  files.write('items', items);
  const report = runValidators(
    module.kind,
    items,
    module.validators,
    parsePrevious(module.kind, previous),
  );
  const withMissing: BatchReport =
    missing.length === 0
      ? report
      : {
          ...report,
          severity:
            module.partialGeneration === true
              ? report.severity === 'fail'
                ? 'fail'
                : 'warn'
              : 'fail',
          batch: [
            ...report.batch,
            {
              id: 'generation-complete',
              severity: module.partialGeneration === true ? 'warn' : 'fail',
              message: `${missing.length} units have no output yet: ${missing
                .slice(0, 5)
                .map((u) => u.id)
                .join(', ')}`,
            },
          ],
        };
  files.write('report', withMissing);

  let ip: IpResult[] = [];
  if (module.ipNames !== undefined && withMissing.items.length > 0) {
    const names = new Set(
      parseItems(module.kind, items).flatMap((item) => [...(module.ipNames?.(item) ?? [])]),
    );
    ip = [...names].map((name) => checkName(name));
    files.write('ip', ip);
    writeText(path.join(files.paths.dir, 'ip-checklist.md'), ipChecklist(ctx.batchKey, ip));
  }
  const flagged = ip.filter((result) => result.status === 'flagged').length;
  log(
    `validate: ${withMissing.counts.pass} pass · ${withMissing.counts.warn} warn · ${withMissing.counts.fail} fail` +
      (ip.length > 0 ? ` · IP ${flagged === 0 ? 'screen clear' : `${flagged} flagged`}` : ''),
  );
  for (const problem of withMissing.batch) log(`  ${problem.severity}: ${problem.message}`);
  for (const item of withMissing.items.filter((i) => i.severity === 'fail').slice(0, 10)) {
    log(`  fail ${item.ref}: ${item.checks.map((c) => c.message).join('; ')}`);
  }
  return { report: withMissing, ip };
}

function parsePrevious<K extends ContentKind>(
  kind: K,
  previous: readonly unknown[],
): ContentItem<K>[] {
  try {
    return parseItems(kind, previous);
  } catch {
    return [];
  }
}
