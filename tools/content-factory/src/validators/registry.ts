/**
 * Validator registry: each kind lists item checks and batch checks. A check returns problems; a
 * `fail` problem blocks the batch from review, a `warn` shows in the review report and lets it
 * through. The report per item is what the ops console shows beside the item.
 */
import { itemRef, parseItems, type ContentItem, type ContentKind } from '@cp/content';

export type Severity = 'pass' | 'warn' | 'fail';

export interface ValidationContext<K extends ContentKind> {
  readonly items: readonly ContentItem<K>[];
  /** The live release's items of the same kind, when there is one (for stability checks). */
  readonly previous: readonly ContentItem<K>[];
}

export interface ItemCheck<K extends ContentKind> {
  readonly id: string;
  readonly severity: 'warn' | 'fail';
  readonly check: (item: ContentItem<K>, ctx: ValidationContext<K>) => readonly string[];
}

export interface BatchProblem {
  /** The item it concerns, or null for the batch as a whole. */
  readonly ref: string | null;
  readonly message: string;
}

export interface BatchCheck<K extends ContentKind> {
  readonly id: string;
  readonly severity: 'warn' | 'fail';
  readonly check: (ctx: ValidationContext<K>) => readonly BatchProblem[];
}

export interface Validators<K extends ContentKind> {
  readonly items: readonly ItemCheck<K>[];
  readonly batch: readonly BatchCheck<K>[];
}

export interface CheckResult {
  readonly id: string;
  readonly severity: 'warn' | 'fail';
  readonly message: string;
}

export interface ItemReport {
  readonly ref: string;
  readonly severity: Severity;
  readonly checks: readonly CheckResult[];
}

export interface BatchReport {
  readonly severity: Severity;
  readonly items: readonly ItemReport[];
  /** Problems about the batch as a whole (counts, coverage). */
  readonly batch: readonly CheckResult[];
  readonly counts: Readonly<Record<Severity, number>>;
}

function worst(results: readonly { severity: 'warn' | 'fail' }[]): Severity {
  if (results.some((r) => r.severity === 'fail')) return 'fail';
  return results.length > 0 ? 'warn' : 'pass';
}

/** Schema check first (every item must parse), then each registered check. */
export function runValidators<K extends ContentKind>(
  kind: K,
  rawItems: readonly unknown[],
  validators: Validators<K>,
  previous: readonly ContentItem<K>[] = [],
): BatchReport {
  let items: ContentItem<K>[];
  try {
    items = parseItems(kind, rawItems);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const batch = [{ id: 'schema', severity: 'fail' as const, message }];
    return { severity: 'fail', items: [], batch, counts: { pass: 0, warn: 0, fail: 1 } };
  }
  const ctx: ValidationContext<K> = { items, previous };
  const byRef = new Map<string, CheckResult[]>(items.map((item) => [itemRef(kind, item), []]));
  const batch: CheckResult[] = [];
  for (const check of validators.batch) {
    for (const problem of check.check(ctx)) {
      const result = { id: check.id, severity: check.severity, message: problem.message };
      const list = problem.ref === null ? undefined : byRef.get(problem.ref);
      if (list === undefined) batch.push(result);
      else list.push(result);
    }
  }
  for (const item of items) {
    const list = byRef.get(itemRef(kind, item)) ?? [];
    for (const check of validators.items) {
      for (const message of check.check(item, ctx)) {
        list.push({ id: check.id, severity: check.severity, message });
      }
    }
  }
  const reports: ItemReport[] = [...byRef].map(([ref, checks]) => ({
    ref,
    severity: worst(checks),
    checks,
  }));
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const report of reports) counts[report.severity] += 1;
  const severity = worst([...batch, ...reports.flatMap((r) => r.checks)]);
  return { severity, items: reports, batch, counts };
}
