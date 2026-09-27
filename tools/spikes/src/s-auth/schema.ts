import type { BetterAuthOptions } from 'better-auth';
import type { BetterAuthDBSchema, DBFieldAttribute } from 'better-auth/db';
import { getAuthTables } from 'better-auth/db';
import type pg from 'pg';

/**
 * There is no supported way to run Better Auth's own migration engine against an
 * arbitrary already-running Postgres connection (its exported test helper only targets a
 * fixed local database, and the CLI package that drives real migrations lags the core
 * plugin surface used here). `getAuthTables` is the same pure function Better Auth's
 * migration engine calls to merge the core schema with every configured plugin's schema,
 * so it is the authoritative source for what tables/columns this harness's config needs.
 * This turns that schema into plain `create table` statements for a throwaway spike
 * database; it intentionally skips NOT NULL/UNIQUE (enforced by Better Auth's own zod
 * input validation, not relied on here) and keeps only what correctness requires: columns
 * of the right type plus foreign keys.
 */
export function computeSpikeAuthTables(options: BetterAuthOptions): BetterAuthDBSchema {
  return getAuthTables(options);
}

function columnType(field: DBFieldAttribute): string {
  switch (field.type) {
    case 'string':
      return 'text';
    case 'number':
      return 'double precision';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'timestamptz';
    case 'json':
      return 'jsonb';
    case 'string[]':
      return 'text[]';
    case 'number[]':
      return 'double precision[]';
    default:
      throw new Error(`s-auth schema: unsupported better-auth field type "${String(field.type)}"`);
  }
}

function onDeleteClause(action: NonNullable<DBFieldAttribute['references']>['onDelete']): string {
  switch (action) {
    case 'restrict':
      return 'restrict';
    case 'set null':
      return 'set null';
    case 'set default':
      return 'set default';
    case 'no action':
      return 'no action';
    case 'cascade':
    case undefined:
      return 'cascade';
    default:
      return 'cascade';
  }
}

/**
 * Creates every table Better Auth's configured plugins declare, then adds their foreign
 * keys in a second pass so declaration order between tables never matters. Idempotent
 * (`if not exists`) so a test file can call it once per fresh Testcontainers database.
 */
export async function ensureBetterAuthSchema(
  pool: pg.Pool,
  tables: BetterAuthDBSchema,
): Promise<void> {
  for (const table of Object.values(tables)) {
    const columns = Object.entries(table.fields)
      .filter(([key]) => key !== 'id')
      .map(([key, field]) => `"${field.fieldName ?? key}" ${columnType(field)}`);
    await pool.query(
      `create table if not exists "${table.modelName}" ("id" text primary key${
        columns.length ? `, ${columns.join(', ')}` : ''
      })`,
    );
  }
  for (const table of Object.values(tables)) {
    for (const [key, field] of Object.entries(table.fields)) {
      if (!field.references) continue;
      const column = field.fieldName ?? key;
      const constraint = `${table.modelName}_${column}_fkey`;
      await pool.query(`
        do $$ begin
          if not exists (select 1 from pg_constraint where conname = '${constraint}') then
            alter table "${table.modelName}" add constraint "${constraint}"
              foreign key ("${column}") references "${field.references.model}" ("${field.references.field}")
              on delete ${onDeleteClause(field.references.onDelete)};
          end if;
        end $$;
      `);
    }
  }
}
