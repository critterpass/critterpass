/**
 * The client database schema: every published server table (generated from Drizzle), the local-only
 * tables, and the registered optimistic overlay tables. Overlay tables are registered by the feature
 * that owns the entity (`registerOverlayTable('plan_items', {...})`) before the database opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { column, Schema, Table, type BaseColumnType, type ColumnsType } from '@powersync/common';

import { LOCAL_TABLES, OVERLAY_TABLE_PREFIX, overlayTable } from './local-tables';
import { SYNCED_TABLE_COLUMNS, SYNCED_TABLE_INDEXES } from './synced-tables.generated';

export type SyncedTableName = keyof typeof SYNCED_TABLE_COLUMNS;

const COLUMN_TYPES: Record<string, BaseColumnType<number | string | null>> = {
  integer: column.integer,
  real: column.real,
  text: column.text,
};

/** Parses one generated spec (`name name:integer lat:real`) into PowerSync columns. */
export function parseColumnSpec(spec: string): ColumnsType {
  const columns: ColumnsType = {};
  for (const entry of spec.split(' ')) {
    const [name = '', type = 'text'] = entry.split(':');
    const columnType = COLUMN_TYPES[type];
    if (name.length === 0 || columnType === undefined) {
      throw new Error(`invalid column spec entry: ${entry}`);
    }
    columns[name] = columnType;
  }
  return columns;
}

export function syncedTables(): Record<SyncedTableName, Table> {
  const tables = {} as Record<SyncedTableName, Table>;
  for (const [name, spec] of Object.entries(SYNCED_TABLE_COLUMNS)) {
    const indexes = Object.entries(SYNCED_TABLE_INDEXES[name as SyncedTableName] ?? {}).map(
      ([index, columns]) => [index, [...columns]] as const,
    );
    tables[name as SyncedTableName] = new Table(parseColumnSpec(spec), {
      indexes: Object.fromEntries(indexes),
    });
  }
  return tables;
}

const overlayRegistry = new Map<string, Table>();

/** Declares `overlay_<entity>` with the entity's columns; call at module load, before opening. */
export function registerOverlayTable(entity: string, columns: ColumnsType): string {
  const name = `${OVERLAY_TABLE_PREFIX}${entity}`;
  overlayRegistry.set(name, overlayTable(columns));
  return name;
}

/** Builds the full schema; `overlays` defaults to every registered overlay table. */
export function buildAppSchema(overlays: ReadonlyMap<string, Table> = overlayRegistry): Schema {
  return new Schema({
    ...syncedTables(),
    ...LOCAL_TABLES,
    ...Object.fromEntries(overlays),
  });
}
