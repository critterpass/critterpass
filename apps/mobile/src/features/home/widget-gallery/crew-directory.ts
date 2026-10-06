/**
 * `snapshot/crews.json` in the App Group (docs/api-contracts-async.md §6): the reader's crews by
 * id, each with its name and its members' first names. Siri's "Switch crew" lists its crews from
 * it and the notification service extension names a push's crew from it, so it is written from the
 * synced crews whenever they change (and only then). Names only: nothing else about a crew or its
 * members leaves the app this way.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: SQL and a file key. */

export const CREWS_SNAPSHOT_KEY = 'crews';
export const CREWS_SCHEMA_VERSION = 1;

/** One row per active member of each of the reader's crews. */
export const CREW_DIRECTORY_SQL = `SELECT c.id AS crew_id, c.name AS crew_name, o.user_id, u.display_name
  FROM crew_members m JOIN crews c ON c.id = m.crew_id
  LEFT JOIN crew_members o ON o.crew_id = c.id AND o.status = 'active'
  LEFT JOIN users u ON u.id = o.user_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY c.id, o.user_id`;
export const CREW_DIRECTORY_TABLES = ['crews', 'crew_members', 'users'];

export interface CrewDirectoryRow {
  readonly crew_id: string;
  readonly crew_name: string | null;
  readonly user_id: string | null;
  readonly display_name: string | null;
}

export interface CrewDirectory {
  readonly [crewId: string]: {
    readonly name: string;
    readonly members: { readonly [uid: string]: { readonly first_name: string } };
  };
}

/** The crews by id; a crew without a name yet is left out (there is nothing to call it). */
export function crewDirectory(rows: readonly CrewDirectoryRow[]): CrewDirectory {
  const crews: Record<string, { name: string; members: Record<string, { first_name: string }> }> =
    {};
  for (const row of rows) {
    const name = row.crew_name?.trim() ?? '';
    if (name === '') continue;
    const crew = (crews[row.crew_id] ??= { name, members: {} });
    const first = row.display_name?.trim().split(/\s+/)[0] ?? '';
    if (row.user_id !== null && first !== '') crew.members[row.user_id] = { first_name: first };
  }
  return crews;
}

export interface CrewDirectoryWriter {
  /** Writes the file when the crews changed since the last write; true when it wrote. */
  write(rows: readonly CrewDirectoryRow[], now?: Date): boolean;
}

export function createCrewDirectoryWriter(sink: {
  writeSnapshot(key: string, json: string): void;
}): CrewDirectoryWriter {
  let last: string | null = null;
  return {
    write(rows, now = new Date()) {
      const crews = crewDirectory(rows);
      const content = JSON.stringify(crews);
      if (content === last) return false;
      sink.writeSnapshot(
        CREWS_SNAPSHOT_KEY,
        JSON.stringify({ schema: CREWS_SCHEMA_VERSION, generated_at: now.toISOString(), crews }),
      );
      last = content;
      return true;
    },
  };
}
