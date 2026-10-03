/**
 * `ai.curate_album` (AI-35): the guide's best-of for a trip's album. Code takes the candidates
 * (sharp photos, the best of each near-duplicate cluster, never one a traveller took out), the
 * guide scores up to 60 of their thumbnails (vision), and code picks 24: everyone tagged in three
 * where the album has them, every day once, the best of the rest. The guide's picks replace its
 * last ones (a traveller's own picks stay as they are), the guide words a note from the facts about
 * the picks, and `curation.done` goes out on the album's channel. Without a model the photos keep
 * neutral scores and the template words the note.
 */
import {
  personaIdSchema,
  recordUsage,
  scoreAlbumPhotos,
  templateAlbumNote,
  writeAlbumNote,
  type AiUsageRecord,
  type AlbumThumbnail,
  type Gateway,
} from '@cp/ai';
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  ALBUM_QUEUES,
  ALBUM_RT,
  albumCurateJobSchema,
  albumNoteFacts,
  channelName,
  photoQualitySchema,
  pickCandidates,
  selectAlbumPicks,
  type PickCandidate,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { AlbumMediaStore } from './process-photo';

/** A gateway per run, reporting usage; absent when no model key is configured. */
export type AlbumCurator = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

/** Thumbnails the guide looks at in one run (the cost bound). */
const SCORED = 60;

interface PhotoRow {
  readonly id: string;
  readonly local_date: string | null;
  readonly quality: unknown;
  readonly thumb_key: string | null;
  readonly people: string[] | null;
  readonly user_pick: boolean | null;
}

export type CurateOutcome =
  | { readonly outcome: 'no_photos' }
  | {
      readonly outcome: 'curated';
      readonly picks: number;
      readonly scored: number;
      readonly note_fallback: boolean;
    };

export async function curateAlbum(
  pool: pg.Pool,
  store: Pick<AlbumMediaStore, 'get'>,
  curator: AlbumCurator | undefined,
  tripId: string,
): Promise<CurateOutcome> {
  const loaded = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PhotoRow>(
      `SELECT p.id, p.local_date::text AS local_date, p.quality, p.thumb_key,
              (SELECT array_agg(pp.user_id ORDER BY pp.user_id) FROM photo_people pp
                WHERE pp.photo_id = p.id) AS people,
              (SELECT ap.picked FROM album_picks ap
                WHERE ap.photo_id = p.id AND ap.picked_by = 'user') AS user_pick
         FROM photos p
        WHERE p.trip_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.id`,
      [tripId],
    );
    const { rows: guide } = await tx.query<{ slug: string | null }>(
      'SELECT g.slug FROM trips t LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
      [tripId],
    );
    return { photos: rows, guide: guide[0]?.slug ?? null };
  });
  if (loaded.photos.length === 0) return { outcome: 'no_photos' };
  const thumbs = new Map(loaded.photos.map((p) => [p.id, p.thumb_key]));
  const unscored: PickCandidate[] = loaded.photos.map((p) => ({
    id: p.id,
    local_date: p.local_date,
    quality: photoQualitySchema.catch({}).parse(p.quality),
    people: p.people ?? [],
    score: null,
    user_pick: p.user_pick,
  }));

  const gateway = curator?.((record) => recordUsage((fn) => withSystem(pool, fn), record));
  let scores: ReadonlyMap<string, number> = new Map();
  if (gateway !== undefined) {
    const thumbnails: AlbumThumbnail[] = [];
    for (const candidate of pickCandidates(unscored).candidates.slice(0, SCORED)) {
      const key = thumbs.get(candidate.id);
      if (key === null || key === undefined) continue;
      const object = await store.get(key);
      if (object === null) continue;
      thumbnails.push({
        photo_id: candidate.id,
        media_type: 'image/jpeg',
        base64: Buffer.from(object.bytes).toString('base64'),
      });
    }
    scores = await scoreAlbumPhotos(gateway, thumbnails, { tripId });
  }
  const photos = unscored.map((p) => ({ ...p, score: scores.get(p.id) ?? null }));
  const selection = selectAlbumPicks(photos);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const picked = selection.picks.map((id) => byId.get(id)).filter((p) => p !== undefined);
  const facts = albumNoteFacts({
    photos: photos.length,
    picks: picked,
    tagged: photos.flatMap((p) => p.people),
    blurry: selection.blurry,
    duplicates: selection.duplicates,
  });
  const persona = personaIdSchema.safeParse(loaded.guide);
  const note =
    gateway === undefined
      ? { note: templateAlbumNote(facts), fallbackUsed: true }
      : await writeAlbumNote(
          gateway,
          { guide: persona.success ? persona.data : 'guest', facts },
          { tripId },
        );

  await withSystem(pool, async (tx) => {
    await tx.query(
      `DELETE FROM album_picks WHERE trip_id = $1 AND picked_by = 'guide'
          AND NOT (photo_id = ANY($2::uuid[]))`,
      [tripId, selection.picks],
    );
    for (const [rank, photoId] of selection.picks.entries()) {
      await tx.query(
        `INSERT INTO album_picks (trip_id, photo_id, picked, picked_by, rank)
         VALUES ($1, $2, true, 'guide', $3)
         ON CONFLICT (trip_id, photo_id) DO UPDATE SET rank = EXCLUDED.rank
          WHERE album_picks.picked_by = 'guide'`,
        [tripId, photoId, rank + 1],
      );
    }
    await tx.query(
      `UPDATE photos p SET is_pick = coalesce(
         (SELECT ap.picked FROM album_picks ap WHERE ap.photo_id = p.id), false)
        WHERE p.trip_id = $1 AND p.deleted_at IS NULL`,
      [tripId],
    );
    await tx.query(
      `INSERT INTO album_curations (trip_id, note, picks, photos, note_fallback, curated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (trip_id) DO UPDATE
          SET note = EXCLUDED.note, picks = EXCLUDED.picks, photos = EXCLUDED.photos,
              note_fallback = EXCLUDED.note_fallback, curated_at = EXCLUDED.curated_at`,
      [tripId, note.note, selection.picks.length, photos.length, note.fallbackUsed],
    );
    await outbox(tx, channelName('trip_album', tripId), ALBUM_RT.curationDone, {
      picks: selection.picks.length,
    });
    await appendDomainEvent(tx, {
      type: 'album.curated',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'guide',
      actorId: null,
      tripId,
      payload: { trip_id: tripId, picks: selection.picks.length },
    });
  });
  return {
    outcome: 'curated',
    picks: selection.picks.length,
    scored: scores.size,
    note_fallback: note.fallbackUsed,
  };
}

export function albumCurateJob(
  store: Pick<AlbumMediaStore, 'get'>,
  curator: AlbumCurator | undefined,
): AnyJobDefinition {
  return defineJob({
    queue: ALBUM_QUEUES.curate,
    schema: albumCurateJobSchema,
    async handler(data, { pool }) {
      return { ...(await curateAlbum(pool, store, curator, data.trip_id)) };
    },
  });
}
