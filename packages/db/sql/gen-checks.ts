/**
 * Emits `CHECK (column IN (...))` SQL from a zod enum's values, so a table's CHECK constraint can
 * never drift from the TypeScript enum callers validate against (docs/code-standards.md §13:
 * "text + CHECK (col IN (...)), generated from the zod enum in packages/domain"). Migration authors
 * call this and paste the result into the migration rather than hand-typing the literal list.
 */

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function constraintName(table: string, column: string): string {
  const parts = table.split('.');
  const bareTable = parts[parts.length - 1] ?? table;
  return `${bareTable}_${column}_check`;
}

export interface GenEnumCheckOptions {
  readonly table: string;
  readonly column: string;
  readonly values: readonly string[];
}

/** `ALTER TABLE <table> ADD CONSTRAINT <table>_<column>_check CHECK (<column> IN (...));` */
export function genEnumCheck({ table, column, values }: GenEnumCheckOptions): string {
  if (values.length === 0) {
    throw new Error(`genEnumCheck: "${table}.${column}" has no values to check against`);
  }
  const list = values.map(quoteLiteral).join(', ');
  return `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName(table, column)} CHECK (${column} IN (${list}));`;
}
