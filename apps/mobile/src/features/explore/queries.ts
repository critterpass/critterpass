/**
 * Explore's local reads: the destination and its guide from the synced catalogue, the month curve
 * (so WHEN TO GO draws offline), the viewer's home airport and currency, their crews, whether a
 * place is saved (a queued save or unsave shows at once) and how a queued command settled.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from './data/live-rows';

export interface DestinationRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly currency: string | null;
  readonly best_months: string | null;
  readonly guide_slug: string | null;
}

const DESTINATION_SQL = `SELECT d.id, d.slug, d.name, d.country, d.currency, d.best_months,
    (SELECT s.guide_slug FROM critter_sets s
      WHERE s.destination_id = d.id AND s.guide_slug IS NOT NULL LIMIT 1) AS guide_slug
  FROM destinations d WHERE d.id = ? OR d.slug = ? LIMIT 1`;
const DESTINATION_TABLES = ['destinations', 'critter_sets'];

/** The destination by id or slug; `loaded` turns true once the catalogue has answered. */
export function useDestinationRow(ref: string | null): {
  readonly row: DestinationRow | null;
  readonly loaded: boolean;
} {
  const live = useLiveRows<DestinationRow>(
    DESTINATION_SQL,
    ref === null || ref === '' ? null : [ref, ref],
    DESTINATION_TABLES,
  );
  return { row: live.rows[0] ?? null, loaded: live.loaded };
}

export interface SeasonMonthRow {
  readonly month: number;
  readonly crowd_index: number;
  readonly highlight_tag: string | null;
  readonly colour_role: string;
}

const SEASON_SQL = `SELECT month, crowd_index, highlight_tag, colour_role FROM season_months
  WHERE destination_id = ? ORDER BY month`;
const SEASON_TABLES = ['season_months'];

export function useSeasonMonths(destinationId: string | null): readonly SeasonMonthRow[] {
  return useLiveRows<SeasonMonthRow>(
    SEASON_SQL,
    destinationId === null ? null : [destinationId],
    SEASON_TABLES,
  ).rows;
}

const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
const UID_TABLES = ['local_state'];

/** The signed-in uid as the local database knows it; null until bound. */
export function useMyUid(): string | null {
  return (
    useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES).rows[0]?.value ?? null
  );
}

export interface Viewer {
  readonly uid: string | null;
  readonly homeAirport: string | null;
  readonly homeCurrency: string | null;
}

const VIEWER_SQL = 'SELECT home_airport, home_currency FROM users WHERE id = ?';
const VIEWER_TABLES = ['users'];

export function useViewer(): Viewer {
  const uid = useMyUid();
  const row = useLiveRows<{ home_airport: string | null; home_currency: string | null }>(
    VIEWER_SQL,
    uid === null ? null : [uid],
    VIEWER_TABLES,
  ).rows[0];
  return {
    uid,
    homeAirport: row?.home_airport?.toUpperCase() ?? null,
    homeCurrency: row?.home_currency?.toUpperCase() ?? null,
  };
}

export interface CrewChoice {
  readonly id: string;
  readonly name: string;
}

const CREWS_SQL = `SELECT c.id, c.name FROM crews c JOIN crew_members m ON m.crew_id = c.id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at`;
const CREWS_TABLES = ['crews', 'crew_members'];

export function useMyCrews(uid: string | null): readonly CrewChoice[] {
  return useLiveRows<{ id: string; name: string | null }>(
    CREWS_SQL,
    uid === null ? null : [uid],
    CREWS_TABLES,
  ).rows.map((row) => ({ id: row.id, name: row.name ?? '' }));
}

const NAMES_SQL = 'SELECT id, display_name FROM users WHERE id IN (SELECT value FROM json_each(?))';
const NAMES_TABLES = ['users'];

/** Display names of the people the device knows, by user id. */
export function useNames(userIds: readonly string[]): ReadonlyMap<string, string> {
  const { rows } = useLiveRows<{ id: string; display_name: string | null }>(
    NAMES_SQL,
    userIds.length === 0 ? null : [JSON.stringify([...userIds].sort())],
    NAMES_TABLES,
  );
  return new Map(rows.flatMap((row) => (row.display_name ? [[row.id, row.display_name]] : [])));
}

export type SavedKind = 'place' | 'poi';

const SAVED_SQL = `SELECT
    (SELECT count(*) FROM saved_items WHERE user_id = ? AND kind = ? AND ref_id = ?) AS synced,
    (SELECT cmd FROM commands WHERE cmd IN ('save_place', 'unsave_place')
       AND json_extract(envelope, '$.payload.place_id') = ? ORDER BY seq DESC LIMIT 1) AS queued`;
const SAVED_TABLES = ['saved_items', 'commands'];

/** Whether the viewer has saved `refId`: the newest queued save or unsave wins over synced rows. */
export function useIsSaved(refId: string | null, kind: SavedKind, uid: string | null): boolean {
  const row = useLiveRows<{ synced: number; queued: string | null }>(
    SAVED_SQL,
    uid === null || refId === null ? null : [uid, kind, refId, refId],
    SAVED_TABLES,
  ).rows[0];
  if (row?.queued === 'save_place') return true;
  if (row?.queued === 'unsave_place') return false;
  return Number(row?.synced ?? 0) > 0;
}

export type OpOutcome =
  | { readonly kind: 'pending' }
  | { readonly kind: 'applied' }
  | { readonly kind: 'rejected'; readonly code: string };

const OUTCOME_SQL = `SELECT (SELECT count(*) FROM commands WHERE id = ?) AS queued,
    (SELECT code FROM rejected_commands WHERE id = ?) AS code`;
const OUTCOME_TABLES = ['commands', 'rejected_commands'];

/** How queued command `opId` settled, from local rows; null with no op to follow. */
export function useOpOutcome(opId: string | null): OpOutcome | null {
  const live = useLiveRows<{ queued: number; code: string | null }>(
    OUTCOME_SQL,
    opId === null ? null : [opId, opId],
    OUTCOME_TABLES,
  );
  const row = live.rows[0];
  if (opId === null || !live.loaded || row === undefined) return null;
  if (row.code !== null) return { kind: 'rejected', code: row.code };
  return row.queued > 0 ? { kind: 'pending' } : { kind: 'applied' };
}

export interface GuideDestination {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly guide_slug: string | null;
}

const GUIDE_DESTINATIONS_SQL = `SELECT d.id, d.slug, d.name, s.guide_slug FROM critter_sets s
    JOIN destinations d ON d.id = s.destination_id WHERE s.guide_slug IS NOT NULL`;
const GUIDE_DESTINATIONS_TABLES = ['critter_sets', 'destinations'];

/** Every destination with a guide of its own, from the synced catalogue. */
export function useGuideDestinations(): {
  readonly rows: readonly GuideDestination[];
  readonly loaded: boolean;
} {
  return useLiveRows<GuideDestination>(GUIDE_DESTINATIONS_SQL, [], GUIDE_DESTINATIONS_TABLES);
}
