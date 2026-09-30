/**
 * Publishes a `media` release: one `media_assets` row per kept item, keyed by its source file.
 * Metadata (subjects, rank, credit, licence) updates in place; a row whose download URL changed
 * goes back to pending. Rows the release no longer has are removed (their stored files are never
 * read again). Every row that is not ready gets a `media.ingest` job in the same transaction.
 */
import type { ContentItem } from '@cp/content';
import { sendInTx } from '@cp/db';
import { MEDIA_INGEST_QUEUE } from '@cp/domain';
import type pg from 'pg';

export async function writeMedia(
  tx: pg.PoolClient,
  items: readonly ContentItem<'media'>[],
  releaseId: string,
): Promise<void> {
  const pending: string[] = [];
  for (const item of items) {
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
        item.subjects,
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
