/**
 * The redaction list, generated from the columns of every table the privacy registry classes C3
 * (sensitive) or C4 (biometric/minors) (docs/data-model-sync-and-privacy.md §1: split tables hold
 * every C3 value). C5 financial records are retained accounting rows, not private text. One list
 * serves two sinks: the prompt (a last pass over rows the context builder serialises) and pino
 * (`pinoRedactPaths`). Key and bookkeeping columns (`id`, `*_id`, `*_at`) are left out: they
 * carry no private value and would otherwise blank ids the tools rely on.
 */
import type { PrivacyClass } from '@cp/domain';

export interface PrivacyTableColumns {
  readonly table: string;
  readonly privacyClass: PrivacyClass;
  readonly columns: readonly string[];
  /** Per-column class overrides from the registry, for the few mixed tables. */
  readonly columnClasses?: Readonly<Record<string, PrivacyClass>>;
}

const PRIVATE_CLASSES: ReadonlySet<PrivacyClass> = new Set(['C3', 'C4']);

const BOOKKEEPING = /^(id|.+_id|.+_at)$/u;

/** Column names whose values never reach a prompt or a log line; sorted, de-duplicated. */
export function redactionKeys(tables: readonly PrivacyTableColumns[]): readonly string[] {
  const keys = new Set<string>();
  for (const table of tables) {
    for (const column of table.columns) {
      const columnClass = table.columnClasses?.[column] ?? table.privacyClass;
      if (PRIVATE_CLASSES.has(columnClass) && !BOOKKEEPING.test(column)) keys.add(column);
    }
  }
  return [...keys].sort();
}

/** pino `redact.paths` for the same keys, at the top level and one object deep. */
export function pinoRedactPaths(keys: readonly string[]): string[] {
  return keys.flatMap((key) => [key, `*.${key}`]);
}

/** Deep copy of `value` with every redacted key removed (not masked: absent keys cost no tokens). */
export function redactRecord<T>(value: T, keys: readonly string[]): T {
  const drop = new Set(keys);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object' && !(node instanceof Date)) {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => !drop.has(key))
          .map(([key, child]) => [key, walk(child)]),
      );
    }
    return node;
  };
  return walk(value) as T;
}
