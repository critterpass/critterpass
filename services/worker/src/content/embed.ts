/**
 * `content.embed`: embeddings for a published help release, so help search can rank by meaning as
 * well as words. No embedding vendor is chosen yet, so like the POI embeddings job this is a real
 * pipeline that does nothing until a vendor is configured; help search meanwhile runs on the
 * articles' full-text index.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../boss/define-job';
import type { EmbeddingVendor } from '../places/embed';

export interface EmbedHelpResult {
  readonly embedded: number;
  readonly skipped: boolean;
}

export async function embedHelpRelease(
  pool: pg.Pool,
  releaseId: string,
  vendor: EmbeddingVendor | undefined,
): Promise<EmbedHelpResult> {
  if (vendor === undefined) return { embedded: 0, skipped: true };
  const articles = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; text: string }>(
      "SELECT id, title || E'\\n' || summary || E'\\n' || body_md AS text FROM help_articles WHERE release_id = $1",
      [releaseId],
    );
    return rows;
  });
  if (articles.length === 0) return { embedded: 0, skipped: false };
  const vectors = await vendor.embed(articles.map((a) => a.text));
  await withSystem(pool, async (tx) => {
    for (const [index, article] of articles.entries()) {
      const vector = vectors[index];
      if (vector === undefined) continue;
      await tx.query('UPDATE help_articles SET embedding = $2::vector WHERE id = $1', [
        article.id,
        `[${vector.join(',')}]`,
      ]);
    }
  });
  return { embedded: articles.length, skipped: false };
}

export function contentEmbedJob(vendor?: EmbeddingVendor): AnyJobDefinition {
  return defineJob({
    queue: 'content.embed',
    schema: z.object({ release_id: z.uuid() }),
    singletonKey: (data) => data.release_id,
    async handler(data, { pool, logger }) {
      const result = await embedHelpRelease(pool, data.release_id, vendor);
      logger.info({ ...result }, 'help embeddings');
      return { ...result };
    },
  });
}
