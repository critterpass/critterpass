/**
 * The lean place index as SQL (docs/data-model.md §3.13 "Lean place index"): which stored places
 * pass the lean rule, which destinations are in use, and the kept set, the places nothing may
 * prune whatever their kind, confidence or destination.
 *
 * The kept set is found from the catalogue rather than from a list of tables: every column of
 * every table that could hold a place id (a `uuid` that is not a key of its own table or a
 * reference to another table, a `uuid[]`, and any `jsonb`, `json`, `text` or `text[]` value, read
 * for ids) is matched against `pois`. So a foreign key, a plan item's place, a spawn rule's list,
 * a swipe deck card, a saved place, a brief's essentials, a media subject `poi:<id>` or a reference
 * added by a later table all keep their place without anyone remembering to list them. The only
 * tables left out are the place's own shadows (`PLACE_SHADOW_TABLES`), which go with it. Editorial
 * rows are kept by `curation`, in the prune's own query.
 *
 * Reading every table needs a role that row security does not filter (`loadKeptPoiIds` refuses to
 * run otherwise): under RLS a reference could be hidden and its place pruned.
 */
import { LEAN_CONFIDENCE_FLOOR, LEAN_KINDS, TRANSIT_HUB_NAME_PATTERN } from '@cp/domain';
import type pg from 'pg';

/** How far back a pitch keeps its destination in use (docs/product-decisions.md D38). */
export const USED_WINDOW_DAYS = 180;

/**
 * Destinations in use: a trip in any phase (as its destination or a stop), or a pitch created in
 * the last `USED_WINDOW_DAYS`. Selects `id`; `$1` is the window in days.
 */
export const USED_DESTINATIONS_SQL = `
  SELECT d.id FROM destinations d
   WHERE EXISTS (SELECT 1 FROM trips t WHERE t.destination_id = d.id)
      OR EXISTS (SELECT 1 FROM trip_stops s WHERE s.destination_id = d.id)
      OR EXISTS (SELECT 1 FROM pitches p WHERE p.destination_id = d.id
                    AND p.created_at >= now() - make_interval(days => $1))`;

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * True for a stored place that passes the lean rule (`isLeanPlace` in `@cp/domain`). Stored rows
 * keep no source label, so a transit hub is told by its name (`TRANSIT_HUB_NAME_PATTERN`). A row
 * OpenStreetMap lists has no confidence floor, and a row only OpenStreetMap lists is one of its
 * sights, which passes in any kind; a row neither Overture nor OpenStreetMap lists fails.
 */
export function leanPlaceSql(alias = 'p'): string {
  const c = (name: string) => `${alias}.${name}`;
  const kinds = LEAN_KINDS.map(sqlText).join(', ');
  const hub = `(${c('category')} = 'transit' AND ${c('name')} ~* ${sqlText(TRANSIT_HUB_NAME_PATTERN)})`;
  const osm = `${c('source_ids')} ? 'osm'`;
  const osmOnly = `(${osm} AND NOT ${c('source_ids')} ? 'overture' AND NOT ${c('source_ids')} ? 'fsq_os')`;
  const kind = `(${c('category')} IN (${kinds}) OR ${hub} OR (${osmOnly} AND ${c('category')} <> 'transit'))`;
  const floor = `(${osm} OR (${c('source_ids')} ? 'overture' AND coalesce(${c('confidence')} >= ${LEAN_CONFIDENCE_FLOOR}, false)))`;
  return `(${kind} AND ${floor})`;
}

/** Tables whose rows about a place are derived from it or retiring: they go with the place. */
export const PLACE_SHADOW_TABLES: readonly string[] = [
  'public.pois',
  'public.place_cards',
  'public.poi_embeddings',
  'public.poi_live_checks',
  'public.poi_foursquare_ids',
  'public.poi_foursquare_photos',
  'public.place_rating_stats',
  'public.fsq_os_export_rows',
];

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

interface ReferenceColumn {
  readonly tbl: string;
  readonly col: string;
  readonly typ: string;
}

/** Columns that could hold a place id (see file header). */
const REFERENCE_COLUMNS_SQL = `
  SELECT format('%I.%I', n.nspname, c.relname) AS tbl, quote_ident(a.attname) AS col,
         format_type(a.atttypid, NULL) AS typ
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
     AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
     AND a.attnum > 0 AND NOT a.attisdropped
     AND format_type(a.atttypid, NULL) IN
           ('uuid', 'uuid[]', 'jsonb', 'json', 'text', 'text[]', 'character varying')
     AND NOT (format('%I.%I', n.nspname, c.relname) = ANY ($1::text[]))
     -- A reference to another table can never hold a place id.
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint f
        WHERE f.conrelid = c.oid AND f.contype = 'f' AND f.conkey = ARRAY[a.attnum]
          AND f.confrelid <> 'public.pois'::regclass)
     -- Nor can a table's own single-column key, unless it also references a place.
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint k
        WHERE k.conrelid = c.oid AND k.contype = 'p' AND k.conkey = ARRAY[a.attnum]
          AND NOT EXISTS (SELECT 1 FROM pg_constraint f
                           WHERE f.conrelid = c.oid AND f.contype = 'f'
                             AND f.conkey = ARRAY[a.attnum]))
   ORDER BY 1, 2`;

function idsInColumnSql({ tbl, col, typ }: ReferenceColumn): string {
  const source =
    typ === 'uuid'
      ? `SELECT t.${col} FROM ${tbl} t WHERE t.${col} IS NOT NULL`
      : typ === 'uuid[]'
        ? `SELECT unnest(t.${col}) FROM ${tbl} t`
        : `SELECT m[1]::uuid FROM ${tbl} t, regexp_matches(t.${col}::text, '${UUID_PATTERN}', 'g') AS m
            WHERE t.${col}::text ~ '${UUID_PATTERN}'`;
  return `SELECT p.id::text AS id FROM pois p WHERE p.id IN (${source})`;
}

export interface KeptPlaces {
  /** Ids of every place something references. */
  readonly ids: ReadonlySet<string>;
  /** How many places each column keeps (`<table>.<column>`), for the operator's report. */
  readonly byColumn: Readonly<Record<string, number>>;
}

/**
 * Every place another row references (see file header), plus the places merged duplicates point
 * at. Throws unless the client's role bypasses row security.
 */
export async function loadKeptPoiIds(client: pg.ClientBase | pg.Pool): Promise<KeptPlaces> {
  const { rows: role } = await client.query<{ sees_all: boolean }>(
    'SELECT rolsuper OR rolbypassrls AS sees_all FROM pg_roles WHERE rolname = current_user',
  );
  if (role[0]?.sees_all !== true) {
    throw new Error('the kept set needs a role that bypasses row security');
  }
  const { rows: columns } = await client.query<ReferenceColumn>(REFERENCE_COLUMNS_SQL, [
    PLACE_SHADOW_TABLES,
  ]);
  const ids = new Set<string>();
  const byColumn: Record<string, number> = {};
  const add = (key: string, found: readonly { id: string }[]) => {
    if (found.length > 0) byColumn[key] = found.length;
    for (const row of found) ids.add(row.id);
  };
  for (const column of columns) {
    const { rows } = await client.query<{ id: string }>(idsInColumnSql(column));
    add(`${column.tbl}.${column.col}`, rows);
  }
  const { rows: mergeTargets } = await client.query<{ id: string }>(
    'SELECT DISTINCT merged_into_id::text AS id FROM pois WHERE merged_into_id IS NOT NULL',
  );
  add('public.pois.merged_into_id', mergeTargets);
  return { ids, byColumn };
}
