/**
 * Loads one destination's curated places: makes sure its open-data places are there (a sparse
 * destination gets the on-demand `places.ingest` job while one can still add places, and is
 * loaded against what there is once none can: `./sparse.ts`), matches each line to one of our
 * rows (`./match.ts`) and writes the line into that row's note as reviewed content
 * (`curation = 'editorial'`), so the note wins over any AI profile. An unmatched line for an
 * activity no map has (a cruise, a hike, a show: `curatedStopOnly`) is a curated-only stop: the
 * itinerary keeps it by name and the OpenStreetMap lookup is not asked.
 * `editorial.curated.rank` makes the place popular in its destination. A re-run writes the same
 * lines again; a place the file no longer names keeps its note but loses its curated block.
 *
 * A line's busy windows become the place's hourly `crowd_forecasts` curves with source
 * `estimate`, as an AI profile's do (replacing any earlier estimate curve; readers still prefer
 * what crews saw and an approved editorial curve). An essential rank flags the place a must-see
 * and essential; a later run without the rank takes both flags back.
 */
import { popularPlaces, withSystem } from '@cp/db';
import { busyWeek, type BusyWindow } from '@cp/domain';
import type pg from 'pg';

import { allowIndexMaintenance } from '../batch-sql';
import { plainWords } from '../pick/match';
import { chooseCuratedMatch, curatedCandidates, type CuratedLead } from './match';
import { curatedStopOnly } from './osm-lookup';
import {
  curatedNameKey,
  curatedNoteLines,
  type CuratedNoteLines,
  type CuratedPlaceRow,
} from './rows';
import { handleSparse, SPARSE_PLACES } from './sparse';

export interface CuratedPlacesReport {
  readonly destination: string;
  readonly status:
    'loaded' | 'checked' | 'unknown_destination' | 'ingest_queued' | 'ingest_running';
  /** Fewer than `SPARSE_PLACES` places, loaded against those because no ingest is pending. */
  readonly sparse: boolean;
  /** A finished run's lost places are being ingested again (`./sparse.ts`); re-run after it. */
  readonly reingestQueued: boolean;
  readonly rows: number;
  readonly matched: readonly {
    readonly name: string;
    readonly poiId: string;
    readonly row: string;
    readonly distanceM: number;
  }[];
  readonly unmatched: readonly {
    readonly name: string;
    readonly closest: { readonly name: string; readonly distanceM: number } | null;
  }[];
  /** The unmatched lines with their rank in the file, for the OpenStreetMap lookup. */
  readonly unmatchedLines: readonly { readonly rank: number; readonly line: CuratedPlaceRow }[];
  /** Unmatched activities no map has, kept as curated-only stops by name (no lookup). */
  readonly curatedStops: readonly string[];
  /** Places of an earlier run the file no longer names (their curated block was removed). */
  readonly dropped: number;
  /** The destination's popular set after the load, and how many of it are curated. */
  readonly popular: { readonly total: number; readonly curated: number } | null;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The stored note with a curated line written in; every other key of the note is kept, except
 * the must-see and essential flags an earlier ranked line set when this line has no rank.
 */
export function mergeCuratedNote(existing: unknown, note: CuratedNoteLines): Obj {
  const base = isObj(existing) ? existing : {};
  const i18n = isObj(base['i18n']) ? base['i18n'] : {};
  const vi = isObj(i18n['vi']) ? i18n['vi'] : {};
  const merged: Obj = { ...base, ...note.lines, i18n: { ...i18n, vi: { ...vi, ...note.vi } } };
  const wasRanked = isObj(base['curated']) && base['curated']['essential_rank'] !== undefined;
  if (wasRanked && note.lines.curated.essential_rank === undefined) {
    delete merged['must_see'];
    delete merged['essential'];
  }
  return merged;
}

async function destinationOf(pool: pg.Pool, slug: string) {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      name: string;
      country: string | null;
      sparse: boolean;
    }>(
      `SELECT d.id, d.name, d.country,
              (SELECT count(*) FROM (SELECT 1 FROM pois p
                 WHERE p.destination_id = d.id AND p.status = 'active' LIMIT $2) AS found) < $2
                AS sparse
         FROM destinations d WHERE d.slug = $1`,
      [slug, SPARSE_PLACES],
    );
    return rows[0];
  });
}

/**
 * Writes one curated line into a row's note and marks the row reviewed; with busy windows, they
 * replace the row's estimate crowd curves.
 */
export async function writeCuratedNote(
  pool: pg.Pool,
  poiId: string,
  note: CuratedNoteLines,
  busy: readonly BusyWindow[] = [],
): Promise<void> {
  await withSystem(pool, async (tx) => {
    await allowIndexMaintenance(tx);
    const { rows } = await tx.query<{ editorial: unknown }>(
      'SELECT editorial FROM pois WHERE id = $1 FOR UPDATE',
      [poiId],
    );
    await tx.query(
      `UPDATE pois SET editorial = $2::jsonb, curation = 'editorial', updated_at = now()
        WHERE id = $1`,
      [poiId, JSON.stringify(mergeCuratedNote(rows[0]?.editorial, note))],
    );
    const week = busyWeek(busy);
    if (week.length === 0) return;
    await tx.query(`DELETE FROM crowd_forecasts WHERE poi_id = $1 AND source = 'estimate'`, [
      poiId,
    ]);
    for (const day of week) {
      await tx.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
         VALUES ($1, $2, $3, 'estimate', now())`,
        [poiId, day.dow, day.hourly],
      );
    }
  });
}

export async function loadCuratedPlaces(
  pool: pg.Pool,
  slug: string,
  lines: readonly CuratedPlaceRow[],
  options: { readonly dryRun: boolean },
): Promise<CuratedPlacesReport> {
  const empty = {
    rows: lines.length,
    matched: [],
    unmatched: [],
    unmatchedLines: [],
    curatedStops: [],
    dropped: 0,
    popular: null,
    reingestQueued: false,
  };
  const destination = await destinationOf(pool, slug);
  if (destination === undefined) {
    return { destination: slug, status: 'unknown_destination', sparse: false, ...empty };
  }
  const step = destination.sparse
    ? await handleSparse(pool, slug, options)
    : ({ status: 'load', reingestQueued: false } as const);
  if (step.status !== 'load') {
    return { destination: slug, status: step.status, sparse: true, ...empty };
  }
  const { sparse } = destination;
  const { reingestQueued } = step;
  const plain = plainWords(destination.name, destination.country);
  const taken = new Set<string>();
  const matched: { name: string; poiId: string; row: string; distanceM: number }[] = [];
  const unmatched: CuratedPlacesReport['unmatched'][number][] = [];
  const unmatchedLines: { rank: number; line: CuratedPlaceRow }[] = [];
  const curatedStops: string[] = [];
  const placed: { poiId: string; rank: number; line: CuratedPlaceRow }[] = [];
  for (const [index, line] of lines.entries()) {
    const lead: CuratedLead = {
      name: line.name_en,
      localName: line.name_local ?? null,
      category: line.category,
      lat: line.lat,
      lng: line.lng,
    };
    const candidates = await withSystem(pool, async (tx) => {
      await allowIndexMaintenance(tx);
      return curatedCandidates(tx, destination.id, lead, plain);
    });
    const verdict = chooseCuratedMatch(lead, candidates, plain, taken);
    if (verdict.kind === 'none' && curatedStopOnly(line)) {
      curatedStops.push(line.name_en);
      continue;
    }
    if (verdict.kind === 'none') {
      const closest = verdict.closest;
      unmatched.push({
        name: line.name_en,
        closest:
          closest === null
            ? null
            : { name: closest.name, distanceM: Math.round(closest.distanceM) },
      });
      unmatchedLines.push({ rank: index + 1, line });
      continue;
    }
    taken.add(verdict.row.id);
    matched.push({
      name: line.name_en,
      poiId: verdict.row.id,
      row: verdict.row.name,
      distanceM: Math.round(verdict.row.distanceM),
    });
    placed.push({ poiId: verdict.row.id, rank: index + 1, line });
  }
  const byName = new Map(placed.map(({ poiId, line }) => [curatedNameKey(line.name_en), poiId]));
  const notes = placed.map(({ poiId, rank, line }) => ({
    poiId,
    note: curatedNoteLines(line, rank, byName),
    busy: line.busy_windows ?? [],
  }));
  if (options.dryRun) {
    return {
      destination: slug,
      status: 'checked',
      sparse,
      reingestQueued,
      rows: lines.length,
      matched,
      unmatched,
      unmatchedLines,
      curatedStops,
      dropped: 0,
      popular: null,
    };
  }
  for (const { poiId, note, busy } of notes) await writeCuratedNote(pool, poiId, note, busy);
  const after = await withSystem(pool, async (tx) => {
    await allowIndexMaintenance(tx);
    const dropped = await tx.query(
      `UPDATE pois
          SET editorial = CASE WHEN editorial->'curated' ? 'essential_rank'
                               THEN editorial - 'curated' - 'must_see' - 'essential'
                               ELSE editorial - 'curated' END,
              updated_at = now()
        WHERE destination_id = $1 AND editorial ? 'curated' AND id <> ALL($2::uuid[])`,
      [destination.id, [...taken]],
    );
    const popular = await popularPlaces(tx, destination.id);
    return {
      dropped: dropped.rowCount ?? 0,
      popular: {
        total: popular.length,
        curated: popular.filter((place) => taken.has(place.poiId)).length,
      },
    };
  });
  return {
    destination: slug,
    status: 'loaded',
    sparse,
    reingestQueued,
    rows: lines.length,
    matched,
    unmatched,
    unmatchedLines,
    curatedStops,
    ...after,
  };
}
