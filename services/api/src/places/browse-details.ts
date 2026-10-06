/**
 * What a map pin or list row shows of a place the phone has never synced: its weekly hours, the
 * editors' must-see flag, the pick job's rank, and a short why-go and best-time line. The lines
 * come from the reviewed note (in the reader's app language where it has been written in it),
 * else from the place's ready AI profile (in the reader's language where it is stored, else
 * English), and the first photo of that profile for a place whose photos live there. Read for the
 * final page only, so search ranking never depends on them.
 */
import { knownHours, localizedEditorial, readEditorialOverlay, type Hours } from '@cp/domain';
import type pg from 'pg';

import { firstProfilePhoto, shownProfilePhotosSql, type PlacePhoto } from './place-photo';

export interface PlaceBrowseDetails {
  /** The weekly schedule; null when no hours are known. */
  readonly hours: Hours | null;
  readonly mustSee: boolean;
  /** The pick job's order among the destination's machine picks (1 first); null when not picked. */
  readonly pickRank: number | null;
  readonly whyGo: string | null;
  readonly bestTime: string | null;
  /** The AI profile's first photo where the place page shows that profile; null otherwise. */
  readonly photo: PlacePhoto | null;
}

const NO_BROWSE_DETAILS: PlaceBrowseDetails = {
  hours: null,
  mustSee: false,
  pickRank: null,
  whyGo: null,
  bestTime: null,
  photo: null,
};

interface DetailsRow {
  readonly id: string;
  readonly hours: Hours;
  readonly curation: string;
  readonly editorial: unknown;
  readonly pick_rank: number | null;
  readonly profile_own: { why_go?: unknown; best_time?: unknown } | null;
  readonly profile_en: { why_go?: unknown; best_time?: unknown } | null;
  readonly profile_photos: unknown;
  readonly reader_locale: string;
}

const line = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** A stored note that does not parse reads as none rather than failing the whole page. */
function noteOf(value: unknown, locale: string) {
  try {
    return localizedEditorial(readEditorialOverlay(value), locale);
  } catch {
    return {};
  }
}

function toDetails(row: DetailsRow, mediaBaseUrl: string | undefined): PlaceBrowseDetails {
  const note = noteOf(row.editorial, row.reader_locale);
  const reviewed = row.curation === 'editorial';
  const own = row.profile_own;
  const english = row.profile_en;
  return {
    hours: knownHours(row.hours),
    mustSee: reviewed && note.must_see === true,
    pickRank: row.pick_rank,
    whyGo: line(note.why_go) ?? line(own?.why_go) ?? line(english?.why_go),
    bestTime: line(note.best_time) ?? line(own?.best_time) ?? line(english?.best_time),
    photo: firstProfilePhoto(row.profile_photos, mediaBaseUrl),
  };
}

/**
 * The details of `ids`, by id, in the caller's `withUser` transaction (the reader's language is
 * `app.user_locale(app.uid())`, English without a reader).
 */
async function readBrowseDetails(
  tx: pg.PoolClient,
  ids: readonly string[],
  mediaBaseUrl: string | undefined,
): Promise<ReadonlyMap<string, PlaceBrowseDetails>> {
  if (ids.length === 0) return new Map();
  const { rows } = await tx.query<DetailsRow>(
    `WITH reader AS (SELECT app.user_locale(app.uid()) AS locale)
     SELECT p.id, p.hours, p.curation, p.editorial, p.pick_rank, reader.locale AS reader_locale,
            CASE WHEN pp.status = 'ready' THEN pp.texts -> reader.locale END AS profile_own,
            CASE WHEN pp.status = 'ready' THEN pp.texts -> 'en' END AS profile_en,
            ${shownProfilePhotosSql('p', 'pp')} AS profile_photos
       FROM pois p
       CROSS JOIN reader
       LEFT JOIN place_profiles pp ON pp.poi_id = p.id
      WHERE p.id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.id, toDetails(row, mediaBaseUrl)]));
}

/**
 * `items` with their details, in order. Photo addresses are on `mediaBaseUrl` (the media host
 * from the environment when not given).
 */
export async function withBrowseDetails<T extends { readonly id: string }>(
  tx: pg.PoolClient,
  items: readonly T[],
  mediaBaseUrl?: string,
): Promise<readonly (T & PlaceBrowseDetails)[]> {
  const details = await readBrowseDetails(
    tx,
    items.map((item) => item.id),
    mediaBaseUrl,
  );
  return items.map((item) => ({ ...item, ...(details.get(item.id) ?? NO_BROWSE_DETAILS) }));
}
