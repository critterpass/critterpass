/**
 * Explore's local reads: the destination and its guide from the synced catalogue, the month curve
 * (an api read whose last good copy draws WHEN TO GO offline), the viewer's home airport and
 * currency, their crews, whether a place is saved (a queued save or unsave shows at once) and how
 * a queued command settled. Picks and kind counts add the api's browse (`useDestinationPlaces`),
 * so unsynced places count too.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { shownName } from '@cp/domain';
import { useMemo } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { DESTINATION_GUIDE_TABLES, destinationGuideSql, useGuidesPerCity } from '@/data/guides';
import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { useDestinationSeason } from '@/data/travel-data/shared-content';

import { PICK_KIND_ORDER } from './category';
import { useLiveRows } from './data/live-rows';
import { useDestinationPlaces, type BrowsePlace } from './map-queries';

export interface DestinationRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly currency: string | null;
  readonly best_months: string | null;
  readonly tz: string | null;
  /** `live` once the destination has a checked set of picks. */
  readonly coverage: string | null;
  readonly guide_slug: string | null;
}

const PLACE_GUIDE_SQL = `(SELECT s.guide_slug FROM critter_sets s
      WHERE s.destination_id = d.id AND s.guide_slug IS NOT NULL LIMIT 1)`;
const destinationSql = (
  perCity: boolean,
) => `SELECT d.id, d.slug, d.name, d.country, d.currency, d.best_months, d.tz, d.coverage,
    ${destinationGuideSql(perCity, 'd.critter_key', PLACE_GUIDE_SQL)} AS guide_slug
  FROM destinations d WHERE d.id = ? OR d.slug = ? LIMIT 1`;
const DESTINATION_TABLES = ['destinations', 'critter_sets', ...DESTINATION_GUIDE_TABLES];

/** The destination by id or slug; `loaded` turns true once the catalogue has answered. */
export function useDestinationRow(ref: string | null): {
  readonly row: DestinationRow | null;
  readonly loaded: boolean;
} {
  const perCity = useGuidesPerCity();
  const live = useLiveRows<DestinationRow>(
    destinationSql(perCity),
    ref === null || ref === '' ? null : [ref, ref],
    DESTINATION_TABLES,
  );
  return { row: live.rows[0] ?? null, loaded: live.loaded };
}

/** How many of one kind lead before the next kind has its turn (as the api's picks read). */
const PICKS_PER_KIND = 3;
const KIND_RANK_SQL = `(CASE category ${PICK_KIND_ORDER.map(
  (kind, index) => `WHEN '${kind}' THEN ${String(index)}`,
).join(' ')} ELSE ${String(PICK_KIND_ORDER.length)} END)`;

/**
 * The recommended places this phone holds for a destination, in the order the api's picks read
 * uses: the editors' must-sees, then the automatic picks by rank; where neither ranks a place,
 * sights lead, three of a kind at a time. Never by name. Stays are never picks.
 */
const LOCAL_PICKS_SQL = `WITH ranked AS (
    SELECT id, name, category, pick_rank,
      (curation = 'editorial' AND json_extract(editorial, '$.must_see') = 1) AS must_see,
      ${KIND_RANK_SQL} AS kind_rank
    FROM pois
    WHERE destination_id = ? AND status = 'active' AND merged_into_id IS NULL
      AND category <> 'stay' AND (curation = 'editorial' OR pick_rank IS NOT NULL)),
  turns AS (
    SELECT *, row_number() OVER (PARTITION BY must_see, kind_rank ORDER BY id) AS in_kind
    FROM ranked)
  SELECT id AS poiId, name, name_local AS nameLocal, category FROM turns
  ORDER BY must_see DESC, pick_rank IS NULL, pick_rank,
    (in_kind - 1) / ${String(PICKS_PER_KIND)}, kind_rank, in_kind
  LIMIT ?`;

export interface LocalPick {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
}

type HeldPick = LocalPick & { readonly nameLocal: string | null };

/** The phone's picks in order, then the browse's recommended places it lacks, up to `limit`. */
export function picksWithBrowsed(
  held: readonly HeldPick[],
  browsed: readonly BrowsePlace[],
  limit: number,
  readsLocal: boolean,
): readonly LocalPick[] {
  const ids = new Set(held.map((pick) => pick.poiId));
  const extra = browsed
    .filter((p) => p.recommended && p.category !== 'stay' && !ids.has(p.id))
    .map((p) => ({ poiId: p.id, name: p.name, nameLocal: p.nameLocal, category: p.category }));
  return [...held, ...extra].slice(0, limit).map(({ nameLocal, ...pick }) => ({
    ...pick,
    name: shownName({ name: pick.name, nameLocal }, readsLocal),
  }));
}

export function useLocalPicks(destinationId: string | null, limit: number): readonly LocalPick[] {
  const readsLocal = useReadsLocalNames(destinationId);
  const rows = useLiveRows<HeldPick>(
    LOCAL_PICKS_SQL,
    destinationId === null ? null : [destinationId, limit],
    ['pois'],
  ).rows;
  const browsed = dataOf(useDestinationPlaces(destinationId))?.results;
  return useMemo(
    () => picksWithBrowsed(rows, browsed ?? [], limit, readsLocal),
    [rows, browsed, limit, readsLocal],
  );
}

const KINDS_SQL = `SELECT id, category FROM pois
  WHERE destination_id = ? AND status = 'active' AND merged_into_id IS NULL`;

export interface KindCount {
  readonly category: string;
  readonly n: number;
}
/** How many places of each kind, counting each place once across the phone and the browse. */
export function countKinds(
  held: readonly { readonly id: string; readonly category: string }[],
  browsed: readonly BrowsePlace[],
): readonly KindCount[] {
  const kinds = new Map<string, string>();
  // The phone's row is set last, so its kind wins for a place both hold.
  for (const place of [...browsed, ...held]) kinds.set(place.id, place.category);
  const counts = new Map<string, number>();
  for (const category of kinds.values()) counts.set(category, (counts.get(category) ?? 0) + 1);
  return [...counts].map(([category, n]) => ({ category, n }));
}

/** How many places of each category a destination has, on the phone or in the api's browse. */
export function usePlaceKindCounts(destinationId: string | null): readonly KindCount[] {
  const held = useLiveRows<{ id: string; category: string }>(
    KINDS_SQL,
    destinationId === null ? null : [destinationId],
    ['pois'],
  ).rows;
  const browsed = dataOf(useDestinationPlaces(destinationId))?.results;
  return useMemo(() => countKinds(held, browsed ?? []), [held, browsed]);
}

export interface SeasonMonthRow {
  readonly month: number;
  readonly crowd_index: number;
  readonly highlight_tag: string | null;
  readonly colour_role: string;
}

const NO_MONTHS: readonly SeasonMonthRow[] = [];

/** A destination's reviewed season months (an api read, the last good copy offline). */
export function useSeasonMonths(destinationId: string | null): readonly SeasonMonthRow[] {
  return dataOf(useDestinationSeason(destinationId))?.months ?? NO_MONTHS;
}

/** The signed-in uid as the local database knows it; null until bound. */
export function useMyUid(): string | null {
  return useSessionUid();
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

const guideDestinationsSql = (perCity: boolean) => `SELECT d.id, d.slug, d.name,
    ${destinationGuideSql(perCity, 'd.critter_key', 's.guide_slug')} AS guide_slug
  FROM critter_sets s
    JOIN destinations d ON d.id = s.destination_id WHERE s.guide_slug IS NOT NULL
  GROUP BY d.id`;
const GUIDE_DESTINATIONS_TABLES = ['critter_sets', 'destinations', ...DESTINATION_GUIDE_TABLES];

/** Every destination with a guide of its own, from the synced catalogue. */
export function useGuideDestinations(): {
  readonly rows: readonly GuideDestination[];
  readonly loaded: boolean;
} {
  const perCity = useGuidesPerCity();
  return useLiveRows<GuideDestination>(
    guideDestinationsSql(perCity),
    [],
    GUIDE_DESTINATIONS_TABLES,
  );
}
