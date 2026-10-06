/**
 * What the must-dos step reads locally: the trip's live must-dos (with their place's address, from
 * the trip's own place card: a must-do's place syncs with the trip), the latest `set_must_dos` list
 * this phone has queued for the trip (so an offline add shows at once), and the trip's destination
 * for the place search, which reads through the api (./places). All synced or local rows: works
 * offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows } from '../data/rows';
import type { MustDoRow, QueuedItem } from './model';

export const MUST_DOS_SQL = `SELECT m.id, m.owner_id, m.title, m.poi_id, m.priority, m.co_owner_ids,
    m.fit_status, m.fit_note, m.target_day, m.external_action, m.external_deadline,
    m.fit_checked_at, p.address AS place_address
  FROM must_dos m LEFT JOIN pois p ON p.id = m.poi_id
  WHERE m.trip_id = ? AND m.deleted_at IS NULL
  ORDER BY m.created_at, m.id`;
const MUST_DOS_TABLES = ['must_dos', 'pois'];

/** This phone's newest queued list for the trip (a later send replaces the whole list). */
export const QUEUED_SQL = `SELECT json_extract(envelope, '$.payload.items') AS items
  FROM commands
  WHERE cmd = 'set_must_dos' AND json_extract(envelope, '$.payload.trip_id') = ?
  ORDER BY seq DESC LIMIT 1`;
const QUEUED_TABLES = ['commands'];

export const DESTINATION_SQL = 'SELECT destination_id FROM trips WHERE id = ?';

function parseItems(value: string | null): QueuedItem[] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as QueuedItem[]) : null;
  } catch {
    return null;
  }
}

export interface MustDosData {
  readonly loaded: boolean;
  readonly rows: readonly MustDoRow[];
  readonly queued: readonly QueuedItem[] | null;
  readonly destinationId: string | null;
}

export function useMustDosData(tripId: string): MustDosData {
  const rows = useLiveRows<MustDoRow>(MUST_DOS_SQL, [tripId], MUST_DOS_TABLES);
  const queued = useLiveRows<{ items: string | null }>(QUEUED_SQL, [tripId], QUEUED_TABLES);
  const trip = useLiveRows<{ destination_id: string | null }>(DESTINATION_SQL, [tripId], ['trips']);
  return {
    loaded: rows.loaded && queued.loaded,
    rows: rows.rows,
    queued: parseItems(queued.rows[0]?.items ?? null),
    destinationId: trip.rows[0]?.destination_id ?? null,
  };
}
