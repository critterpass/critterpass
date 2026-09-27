/**
 * Field-level diff between two value maps, for the preview shown before every save and for the
 * stale-version conflict view (what changed on the server vs. what the operator is about to write).
 */

export interface FieldChange {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(',')}}`;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/** Fields whose value differs, in the order they first appear in `after` then `before`. */
export function diffValues(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): readonly FieldChange[] {
  const fields = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  return fields
    .filter((field) => !valuesEqual(before[field], after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
