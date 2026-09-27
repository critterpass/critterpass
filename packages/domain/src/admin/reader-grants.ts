/**
 * `admin_reader` column grants derived from the privacy map (docs/data-model.md §2: SELECT on
 * `ops.*` plus non-C3 `public` columns). Support tooling reads through this role, so a C3 value
 * (split sensitive tables, secrets) is unreachable by grant, not just by query discipline. C4 is
 * never stored, and an unregistered table is never granted: classification comes first.
 */
import type { PrivacyClass, TablePrivacy } from '../privacy';

/** Classes `admin_reader` may never read. */
export const ADMIN_READER_DENIED_CLASSES: ReadonlySet<PrivacyClass> = new Set(['C3', 'C4']);

export interface TableColumns {
  readonly table: string;
  readonly columns: readonly string[];
}

export interface AdminReaderGrant {
  readonly table: string;
  readonly columns: readonly string[];
}

export function columnPrivacyClass(privacy: TablePrivacy, column: string): PrivacyClass {
  return privacy.columns?.[column] ?? privacy.class;
}

/**
 * The columns `admin_reader` may SELECT for each table, sorted by table then column. Tables with no
 * privacy registration, or no readable column, produce no grant at all.
 */
export function computeAdminReaderGrants(
  tables: readonly TableColumns[],
  privacyOf: (table: string) => TablePrivacy | undefined,
): readonly AdminReaderGrant[] {
  const grants: AdminReaderGrant[] = [];
  for (const { table, columns } of [...tables].sort((a, b) => a.table.localeCompare(b.table))) {
    const privacy = privacyOf(table);
    if (privacy === undefined) continue;
    const readable = columns
      .filter((column) => !ADMIN_READER_DENIED_CLASSES.has(columnPrivacyClass(privacy, column)))
      .sort();
    if (readable.length > 0) grants.push({ table, columns: readable });
  }
  return grants;
}

/** SQL for one table: a column-list SELECT grant plus the read-all RLS policy for the role. */
export function renderAdminReaderGrantSql(grant: AdminReaderGrant): string {
  return [
    `GRANT SELECT (${grant.columns.join(', ')}) ON ${grant.table} TO admin_reader;`,
    `CREATE POLICY ${grant.table}_admin_reader ON ${grant.table} FOR SELECT TO admin_reader USING (true);`,
  ].join('\n');
}
