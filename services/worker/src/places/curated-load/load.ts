/**
 * Loads one destination's curated places: makes sure its open-data places are there (a sparse
 * destination gets the same on-demand `places.ingest` job a pitch would queue, and is loaded on a
 * later run), matches each line to one of our rows (`./match.ts`) and writes the line into that
 * row's note as reviewed content (`curation = 'editorial'`), so the note wins over any AI profile.
 * `editorial.curated.rank` makes the place popular in its destination. A re-run writes the same
 * lines again; a place the file no longer names keeps its note but loses its curated block.
 */
import { popularPlaces, sendInTx, withSystem } from '@cp/db';
import { PLACES_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { allowIndexMaintenance } from '../batch-sql';
import { plainWords } from '../pick/match';
import { chooseCuratedMatch, curatedCandidates, type CuratedLead } from './match';
import { curatedNoteLines, type CuratedNoteLines, type CuratedPlaceRow } from './rows';

/** Fewer active places than this and the destination is ingested first (as on demand). */
export const SPARSE_PLACES = 50;
/** The api's on-demand ingest key and retry window, so the two never queue the same slug twice. */
const INGEST_RETRY_SECONDS = 7 * 24 * 3_600;

export interface CuratedPlacesReport {
  readonly destination: string;
  readonly status: 'loaded' | 'checked' | 'unknown_destination' | 'ingest_queued';
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
  /** Places of an earlier run the file no longer names (their curated block was removed). */
  readonly dropped: number;
  /** The destination's popular set after the load, and how many of it are curated. */
  readonly popular: { readonly total: number; readonly curated: number } | null;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored note with a curated line written in; every other key of the note is kept. */
export function mergeCuratedNote(existing: unknown, note: CuratedNoteLines): Obj {
  const base = isObj(existing) ? existing : {};
  const i18n = isObj(base['i18n']) ? base['i18n'] : {};
  const vi = isObj(i18n['vi']) ? i18n['vi'] : {};
  return { ...base, ...note.lines, i18n: { ...i18n, vi: { ...vi, ...note.vi } } };
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

async function writeNote(pool: pg.Pool, poiId: string, note: CuratedNoteLines): Promise<void> {
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
  });
}

export async function loadCuratedPlaces(
  pool: pg.Pool,
  slug: string,
  lines: readonly CuratedPlaceRow[],
  options: { readonly dryRun: boolean },
): Promise<CuratedPlacesReport> {
  const empty = { rows: lines.length, matched: [], unmatched: [], dropped: 0, popular: null };
  const destination = await destinationOf(pool, slug);
  if (destination === undefined) {
    return { destination: slug, status: 'unknown_destination', ...empty };
  }
  if (destination.sparse) {
    if (!options.dryRun) {
      await withSystem(pool, (tx) =>
        sendInTx(
          tx,
          PLACES_QUEUES.ingest,
          { slug },
          { singletonKey: `on-demand-ingest:${slug}`, singletonSeconds: INGEST_RETRY_SECONDS },
        ),
      );
    }
    return { destination: slug, status: 'ingest_queued', ...empty };
  }
  const plain = plainWords(destination.name, destination.country);
  const taken = new Set<string>();
  const matched: { name: string; poiId: string; row: string; distanceM: number }[] = [];
  const unmatched: CuratedPlacesReport['unmatched'][number][] = [];
  const notes: { poiId: string; note: CuratedNoteLines }[] = [];
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
    if (verdict.kind === 'none') {
      const closest = verdict.closest;
      unmatched.push({
        name: line.name_en,
        closest:
          closest === null
            ? null
            : { name: closest.name, distanceM: Math.round(closest.distanceM) },
      });
      continue;
    }
    taken.add(verdict.row.id);
    matched.push({
      name: line.name_en,
      poiId: verdict.row.id,
      row: verdict.row.name,
      distanceM: Math.round(verdict.row.distanceM),
    });
    notes.push({ poiId: verdict.row.id, note: curatedNoteLines(line, index + 1) });
  }
  if (options.dryRun) {
    return {
      destination: slug,
      status: 'checked',
      rows: lines.length,
      matched,
      unmatched,
      dropped: 0,
      popular: null,
    };
  }
  for (const { poiId, note } of notes) await writeNote(pool, poiId, note);
  const after = await withSystem(pool, async (tx) => {
    await allowIndexMaintenance(tx);
    const dropped = await tx.query(
      `UPDATE pois SET editorial = editorial - 'curated', updated_at = now()
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
  return { destination: slug, status: 'loaded', rows: lines.length, matched, unmatched, ...after };
}
