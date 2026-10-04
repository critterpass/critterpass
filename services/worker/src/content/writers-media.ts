/**
 * Publishes a `media` release: one `media_assets` row per kept item, keyed by its source file.
 * Metadata (subjects, rank, credit, licence) updates in place; a row whose download URL changed
 * goes back to pending. Rows the release no longer has are removed (their stored files are never
 * read again). Every row that is not ready gets a `media.ingest` job in the same transaction.
 * A place's photo names the place by its source ref (`poi:fsq-os-<id>`, `poi:overture-<id>`,
 * `poi:editorial-<id>`); it is stored under this
 * environment's POI id (`poi:<uuid>`), the subject the app reads. A ref with no active POI here is
 * dropped, and an item left with no subject is not stored.
 */
import { poiRefOfSubject, type ContentItem, type PoiRefSource } from '@cp/content';
import { sendInTx } from '@cp/db';
import { MEDIA_INGEST_QUEUE } from '@cp/domain';
import type pg from 'pg';

export async function writeMedia(
  tx: pg.PoolClient,
  items: readonly ContentItem<'media'>[],
  releaseId: string,
): Promise<void> {
  const pending: string[] = [];
  const resolve = await placeSubjects(tx, items);
  for (const item of items) {
    const subjects = resolve(item.subjects);
    if (subjects.length === 0) continue;
    const { rows } = await tx.query<{ id: string; status: string }>(
      `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys, rank,
         title, author, author_url, licence, licence_url, attribution_required, credit, width, height,
         duration_ms, release_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (source, kind, source_id) DO UPDATE SET source_url = EXCLUDED.source_url,
         subject_keys = EXCLUDED.subject_keys, rank = EXCLUDED.rank, title = EXCLUDED.title,
         author = EXCLUDED.author, author_url = EXCLUDED.author_url, licence = EXCLUDED.licence,
         licence_url = EXCLUDED.licence_url, attribution_required = EXCLUDED.attribution_required,
         credit = EXCLUDED.credit, release_id = EXCLUDED.release_id,
         download_url = EXCLUDED.download_url,
         status = CASE WHEN media_assets.download_url = EXCLUDED.download_url
           THEN media_assets.status ELSE 'pending' END
       RETURNING id, status`,
      [
        item.kind,
        item.source,
        item.source_id,
        item.source_url,
        item.download_url,
        subjects,
        item.rank,
        item.title,
        item.author,
        item.author_url,
        item.licence,
        item.licence_url,
        item.attribution_required,
        item.credit,
        item.width,
        item.height,
        item.duration_ms,
        releaseId,
      ],
    );
    const row = rows[0];
    if (row !== undefined && row.status !== 'ready') pending.push(row.id);
  }
  await tx.query('DELETE FROM media_assets WHERE release_id IS DISTINCT FROM $1', [releaseId]);
  for (const id of pending) {
    await sendInTx(tx, MEDIA_INGEST_QUEUE, { asset_id: id }, { singletonKey: id });
  }
}

const REF_SOURCES: readonly PoiRefSource[] = ['fsq_os', 'overture', 'editorial'];

/**
 * The id as the source wrote it. A subject is lower case; Foursquare and Overture ids are too, and
 * an editorial place's id is a Wikidata one with its capital Q (`wikidata-Q391406`).
 */
function storedId(source: PoiRefSource, id: string): string {
  return source === 'editorial' ? id.replace(/^wikidata-q/u, 'wikidata-Q') : id;
}

/**
 * Maps each `poi:<source>-<id>` subject to `poi:<uuid>` of the active POI it names. One query per
 * source, each written so that source's partial unique index serves it (the key is a literal and
 * the `?` guard repeats the index's predicate): matching every source in one condition, or folding
 * the stored id's case, reads every POI of every destination and runs past the statement timeout.
 */
async function placeSubjects(
  tx: pg.PoolClient,
  items: readonly ContentItem<'media'>[],
): Promise<(subjects: readonly string[]) => string[]> {
  const refs = items.flatMap((item) => item.subjects.flatMap((s) => poiRefOfSubject(s) ?? []));
  const ids = new Map<string, string>();
  for (const source of REF_SOURCES) {
    const wanted = [
      ...new Set(refs.filter((r) => r.source === source).map((r) => storedId(source, r.id))),
    ];
    if (wanted.length === 0) continue;
    const { rows } = await tx.query<{ id: string; ref: string }>(
      `SELECT id, source_ids ->> '${source}' AS ref
         FROM pois
        WHERE source_ids ? '${source}' AND source_ids ->> '${source}' = ANY($1::text[])
          AND status = 'active' AND merged_into_id IS NULL`,
      [wanted],
    );
    for (const row of rows) ids.set(`${source}:${row.ref.toLowerCase()}`, row.id);
  }
  return (subjects) => [
    ...new Set(
      subjects.flatMap((subject) => {
        const ref = poiRefOfSubject(subject);
        if (ref === null) return [subject];
        const id = ids.get(`${ref.source}:${ref.id}`);
        return id === undefined ? [] : [`poi:${id}`];
      }),
    ),
  ];
}
