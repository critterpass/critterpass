/**
 * A destination's first-timer picks: its recommended places (the curated set, or the machine
 * picks where nothing is curated). The destination brief's essentials come first, by the brief's
 * rank and with its line on why to go (in the reader's language once translated; a missing
 * language is queued), then must-sees, then the machine picks by rank. A curated
 * set with no must-sees marked has no rank of its own, so there sights lead: temples and shrines,
 * nature, beaches, museums and markets before places to eat, and those before nightlife, three of
 * a kind at a time so the row is not one kind only. Within a kind the crew's (or the viewer's)
 * taste tags decide, then how well the place is sourced; never the alphabet. Commission-neutral: nothing a
 * partner pays for moves an organic pick; the sponsored slot is added separately and labelled.
 * Rows that are one place (a beach under three sources, a mountain under three names) are picked
 * once. A pick whose photos live in its AI profile carries the first of them, and the first pick
 * with a photo stands in as the destination's cover where it has no curated one.
 */
import { briefRankSql, QUALITY_SCORE, recommendedSql, sendInTx } from '@cp/db';
import {
  distinctPlaces,
  localizedEditorial,
  PLACES_QUEUES,
  placesBriefTranslateKey,
  readEditorialOverlay,
} from '@cp/domain';
import type pg from 'pg';

import { firstProfilePhoto, shownProfilePhotosSql } from '../places/place-photo';
import { profileLocaleOf } from '../places/profile';
import { onePerPlace } from '../places/same-place';

export const PICKS_LIMIT = 8;
/** How many of one kind lead before the next kind has its turn. */
export const PICKS_PER_KIND = 3;

/** Kinds of place in the order a first-timer's picks lead with them. */
export const PICK_KIND_ORDER = [
  'temple_shrine',
  'nature',
  'beach',
  'museum',
  'market',
  'other',
  'shopping',
  'health',
  'food',
  'nightlife',
  'transit',
  'stay',
] as const;

/** A place's position in `PICK_KIND_ORDER`, as SQL over its `category`. */
export function pickKindRankSql(alias = 'p'): string {
  const whens = PICK_KIND_ORDER.map((kind, index) => `WHEN '${kind}' THEN ${String(index)}`).join(
    ' ',
  );
  return `(CASE ${alias}.category ${whens} ELSE ${String(PICK_KIND_ORDER.length)} END)`;
}
/** Rows read per pick: room for the duplicates dropped before the limit. */
const READ_PER_PICK = 4;

export interface DestinationPick {
  readonly poi_id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly tags: readonly string[];
  readonly must_see: boolean;
  readonly why_go: string | null;
  readonly taste_matches: number;
  /** The AI profile's first photo where the place page shows that profile; null otherwise. */
  readonly photo: PickPhoto | null;
}

export interface PickPhoto {
  readonly url: string;
  /** The page the photo was found on. */
  readonly source_page: string;
}

/** A photo standing in as a destination's cover: a pick's, named so the app can credit it. */
export interface DestinationCover extends PickPhoto {
  readonly poi_id: string;
  readonly name: string;
}

/** The first pick with a photo (the top essential where the brief has one), as the cover. */
export function coverOf(picks: readonly DestinationPick[]): DestinationCover | null {
  const pick = picks.find((entry) => entry.photo !== null);
  return pick === undefined || pick.photo === null
    ? null
    : { ...pick.photo, poi_id: pick.poi_id, name: pick.name };
}

/** Taste tags of the trip's crew when there is one, else the viewer's own. */
async function tasteTags(tx: pg.PoolClient, tripId: string | null): Promise<string[]> {
  const { rows } =
    tripId === null
      ? await tx.query<{ tag: string }>(
          'SELECT DISTINCT unnest(tags) AS tag FROM taste_profiles WHERE user_id = app.uid()',
        )
      : await tx.query<{ tag: string }>(
          `SELECT DISTINCT unnest(tp.tags) AS tag FROM taste_profiles tp
             JOIN trip_participants p ON p.user_id = tp.user_id
            WHERE p.trip_id = $1 AND p.rsvp IS DISTINCT FROM 'out'`,
          [tripId],
        );
  return rows.map((row) => row.tag.toLowerCase());
}

export async function readPicks(
  tx: pg.PoolClient,
  destinationId: string,
  tripId: string | null,
  /** The media host photo addresses are on (the environment's when not given). */
  mediaBaseUrl?: string,
): Promise<DestinationPick[]> {
  const taste = await tasteTags(tx, tripId);
  const { rows } = await tx.query<
    Omit<DestinationPick, 'why_go' | 'photo'> & {
      lat: number;
      lng: number;
      destination: string;
      editorial: unknown;
      reader_locale: string;
      brief_why: Record<string, string> | null;
      profile_photos: unknown;
    }
  >(
    `WITH ranked AS (
       SELECT p.id AS poi_id, p.name, p.name_local, p.category, p.tags, p.lat, p.lng, p.pick_rank,
              (SELECT d.name FROM destinations d WHERE d.id = p.destination_id) AS destination,
              ${briefRankSql('p')} AS essential_rank,
              (${briefRankSql('p')} IS NOT NULL
                OR coalesce((p.editorial->>'must_see')::boolean, false)) AS must_see,
              (SELECT e.value->'why' FROM destination_briefs b,
                      jsonb_array_elements(b.essentials) AS e(value)
                WHERE b.destination_id = p.destination_id AND b.status = 'ready'
                  AND e.value->>'poi_id' = p.id::text LIMIT 1) AS brief_why,
              p.editorial, app.user_locale(app.uid()) AS reader_locale,
              cardinality(ARRAY(SELECT lower(t) FROM unnest(p.tags) t
                                 INTERSECT SELECT unnest($2::text[]))) AS taste_matches,
              ${pickKindRankSql('p')} AS kind_rank, ${QUALITY_SCORE} AS quality,
              ${shownProfilePhotosSql('p', 'pp')} AS profile_photos
         FROM pois p
         LEFT JOIN place_profiles pp ON pp.poi_id = p.id
        WHERE p.destination_id = $1 AND ${recommendedSql('p')} AND p.status = 'active'
          AND p.merged_into_id IS NULL AND p.category <> 'stay'),
     turns AS (
       SELECT *, row_number() OVER (
                   PARTITION BY must_see, kind_rank
                   ORDER BY taste_matches DESC, quality DESC, poi_id) AS in_kind
         FROM ranked)
     SELECT poi_id, name, name_local, category, tags, lat, lng, destination, must_see, editorial,
            reader_locale, brief_why, taste_matches, profile_photos
       FROM turns
      ORDER BY essential_rank ASC NULLS LAST, must_see DESC, pick_rank ASC NULLS LAST, (in_kind - 1) / $4::int, kind_rank, in_kind
      LIMIT $3`,
    [destinationId, taste, PICKS_LIMIT * READ_PER_PICK, PICKS_PER_KIND],
  );
  const destination = rows[0]?.destination ?? '';
  const locale = profileLocaleOf(rows[0]?.reader_locale) ?? 'en';
  // The brief's line in the reader's app language, else the note's, else the brief's English.
  const picks = rows.map(
    ({ editorial, reader_locale: _locale, brief_why: why, profile_photos: photos, ...row }) => ({
      ...row,
      photo: pickPhoto(photos, mediaBaseUrl),
      why_go:
        nonEmpty(why?.[locale]) ??
        localizedEditorial(readEditorialOverlay(editorial), locale).why_go ??
        nonEmpty(why?.en) ??
        null,
      untranslated: why !== null && nonEmpty(why.en) !== null && nonEmpty(why[locale]) === null,
    }),
  );
  const shown = onePerPlace(distinctPlaces(picks, destination), destination).slice(0, PICKS_LIMIT);
  if (locale !== 'en' && shown.some((pick) => pick.untranslated)) {
    await sendInTx(
      tx,
      PLACES_QUEUES.briefTranslate,
      { destination_id: destinationId, locale },
      { singletonKey: placesBriefTranslateKey(destinationId, locale) },
    );
  }
  return shown.map(
    ({ lat: _lat, lng: _lng, destination: _destination, untranslated: _u, ...pick }) => pick,
  );
}

function pickPhoto(photos: unknown, mediaBaseUrl: string | undefined): PickPhoto | null {
  const photo = firstProfilePhoto(photos, mediaBaseUrl);
  return photo === null ? null : { url: photo.url, source_page: photo.sourcePage };
}

const nonEmpty = (line: string | undefined): string | null =>
  line === undefined || line.trim() === '' ? null : line;
