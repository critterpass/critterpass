/**
 * Local POI full-text search in SQLite (map spec "Offline packs": "PMTiles file + POI subset + local
 * search index") — the actual offline path once a region pack has been downloaded
 * (`useRegionPack.ts`) and no network is available (`usePlaceSearch.ts`).
 *
 * The SQLite access is behind a minimal `OfflineDb` interface (not `expo-sqlite`'s module-level
 * singleton called directly) so this file's real query logic — schema, upsert-by-destination,
 * FTS5 `MATCH` ranking — can be exercised with a real SQLite engine in tests
 * (`better-sqlite3`, already used elsewhere in this repo) without a device or simulator;
 * `getOfflineDb()` is the one place that opens the real on-device database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- every string literal below is SQL (schema,
   column names, query text) or an internal database filename, never user-facing copy. */
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

export interface OfflineDb {
  execAsync: (sql: string) => Promise<unknown>;
  runAsync: (sql: string, params?: readonly unknown[]) => Promise<unknown>;
  getAllAsync: <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;
}

export interface OfflinePlaceRecord {
  readonly id: string;
  readonly destinationId: string;
  readonly name: string;
  readonly iconKey: string;
  readonly categoryLabel: string;
  readonly lat: number;
  readonly lng: number;
}

const DATABASE_NAME = 'cp-offline-places.db';

let cachedDb: OfflineDb | undefined;

function expoSqliteAdapter(db: SQLiteDatabase): OfflineDb {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params as SQLiteBindValue[]),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLiteBindValue[]),
  };
}

/** Opens (or reuses) the on-device SQLite database. Not called by tests — see this file's header. */
export async function getOfflineDb(): Promise<OfflineDb> {
  if (cachedDb !== undefined) return cachedDb;
  const { openDatabaseAsync } = (await import('expo-sqlite')) as {
    openDatabaseAsync: (name: string) => Promise<SQLiteDatabase>;
  };
  const db = await openDatabaseAsync(DATABASE_NAME);
  cachedDb = expoSqliteAdapter(db);
  return cachedDb;
}

export async function ensureOfflineSchema(db: OfflineDb): Promise<void> {
  await db.execAsync(
    `CREATE VIRTUAL TABLE IF NOT EXISTS places_offline USING fts5(
       id UNINDEXED, destination_id UNINDEXED, name, icon_key UNINDEXED,
       category_label UNINDEXED, lat UNINDEXED, lng UNINDEXED
     )`,
  );
}

/** Replaces the whole offline index for one destination — a region re-download always ships a
 *  fresh POI subset, never an incremental diff, so stale/removed places never linger. */
export async function indexPlacesOffline(
  db: OfflineDb,
  destinationId: string,
  places: readonly OfflinePlaceRecord[],
): Promise<void> {
  await ensureOfflineSchema(db);
  await db.runAsync('DELETE FROM places_offline WHERE destination_id = ?', [destinationId]);
  for (const place of places) {
    await db.runAsync(
      `INSERT INTO places_offline (id, destination_id, name, icon_key, category_label, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        place.id,
        place.destinationId,
        place.name,
        place.iconKey,
        place.categoryLabel,
        place.lat,
        place.lng,
      ],
    );
  }
}

export async function clearOfflinePlaces(db: OfflineDb, destinationId: string): Promise<void> {
  await ensureOfflineSchema(db);
  await db.runAsync('DELETE FROM places_offline WHERE destination_id = ?', [destinationId]);
}

/** FTS5 needs at least one non-empty term; a blank query returns everything for the destination
 *  (browsing without typing yet, still "search" from the caller's point of view). Each token is
 *  double-quoted so FTS5 treats it as a literal string prefix match rather than parsing its own
 *  query syntax (`-`, `:`, `NOT`, etc. are all significant to FTS5 otherwise — a place name like
 *  "no-match" would otherwise be misread as a column filter). */
function ftsMatchExpression(query: string): string {
  const term = query.trim();
  if (term.length === 0) return '';
  return term
    .split(/\s+/)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' ');
}

export async function searchPlacesOffline(
  db: OfflineDb,
  destinationId: string,
  query: string,
  limit = 20,
): Promise<OfflinePlaceRecord[]> {
  await ensureOfflineSchema(db);
  const match = ftsMatchExpression(query);
  const rows =
    match.length === 0
      ? await db.getAllAsync<{
          id: string;
          destination_id: string;
          name: string;
          icon_key: string;
          category_label: string;
          lat: number;
          lng: number;
        }>(
          'SELECT id, destination_id, name, icon_key, category_label, lat, lng FROM places_offline WHERE destination_id = ? LIMIT ?',
          [destinationId, limit],
        )
      : await db.getAllAsync<{
          id: string;
          destination_id: string;
          name: string;
          icon_key: string;
          category_label: string;
          lat: number;
          lng: number;
        }>(
          `SELECT id, destination_id, name, icon_key, category_label, lat, lng FROM places_offline
           WHERE destination_id = ? AND places_offline MATCH ?
           ORDER BY rank LIMIT ?`,
          [destinationId, `name: ${match}`, limit],
        );
  return rows.map((row) => ({
    id: row.id,
    destinationId: row.destination_id,
    name: row.name,
    iconKey: row.icon_key,
    categoryLabel: row.category_label,
    lat: row.lat,
    lng: row.lng,
  }));
}
