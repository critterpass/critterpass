/**
 * Chat pings per crew (`crew_members.notify_level`): every crew the person is active in, with the
 * level they chose or, if they never chose, the one the server applies (everything in a small
 * crew, mentions in a larger one). A change still in this phone's queue shows over the synced row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { defaultCrewNotifyLevel, isCrewNotifyLevel, type CrewNotifyLevel } from '@cp/domain';

export const CREW_MODES_SQL = `SELECT c.id AS crew_id, c.name, m.notify_level,
    (SELECT count(*) FROM crew_members a WHERE a.crew_id = c.id AND a.status = 'active') AS size
  FROM crew_members m JOIN crews c ON c.id = m.crew_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at, c.id`;
export const CREW_MODES_TABLES = ['crew_members', 'crews'];
export const QUEUED_CREW_MODES_SQL = `SELECT envelope FROM commands
  WHERE cmd = 'set_crew_notify' ORDER BY seq`;

export interface CrewModeRow {
  readonly crew_id: string;
  readonly name: string;
  readonly notify_level: string | null;
  readonly size: number;
}

export interface CrewChatMode {
  readonly crewId: string;
  readonly name: string;
  readonly level: CrewNotifyLevel;
  /** True when the person never chose and the size-based default applies. */
  readonly byDefault: boolean;
}

/** The newest queued level per crew, from the queue's envelopes (oldest first). */
export function queuedLevels(envelopes: readonly string[]): ReadonlyMap<string, CrewNotifyLevel> {
  const levels = new Map<string, CrewNotifyLevel>();
  for (const raw of envelopes) {
    try {
      const payload = (JSON.parse(raw) as { payload?: { crew_id?: unknown; level?: unknown } })
        .payload;
      const level = payload?.level;
      if (
        typeof payload?.crew_id === 'string' &&
        typeof level === 'string' &&
        isCrewNotifyLevel(level)
      ) {
        levels.set(payload.crew_id, level);
      }
    } catch {
      // A malformed envelope says nothing about the level.
    }
  }
  return levels;
}

export function crewChatModes(
  rows: readonly CrewModeRow[],
  queued: ReadonlyMap<string, CrewNotifyLevel>,
): CrewChatMode[] {
  return rows.map((row) => {
    const chosen = queued.get(row.crew_id) ?? row.notify_level;
    const valid = chosen !== null && isCrewNotifyLevel(chosen) ? chosen : null;
    return {
      crewId: row.crew_id,
      name: row.name,
      level: valid ?? defaultCrewNotifyLevel(Number(row.size)),
      byDefault: valid === null,
    };
  });
}
