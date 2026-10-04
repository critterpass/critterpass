/**
 * `content.publish` (docs/api-contracts-async.md §2.2): publishes an approved content release in
 * one transaction. The artifact's checksum is verified, every catalogue row of the kind is replaced
 * with the release's items, the previously live release of the kind becomes `superseded`, and
 * clients are told to refetch on the `catalog` channel. Help releases also queue `content.embed`,
 * and a places release queues a forced `places.pick` for each destination it wrote to, so one that
 * now has a curated set loses its machine picks and one still short of it is picked again.
 * A release the job must refuse (a card without native review, an unverified safety record) is
 * marked blocked with the reason instead of being retried. A rollback re-approves an older release and runs this same job, so restoring a
 * version is the same one-transaction swap.
 */
import { loadRelease, ReleaseLoadError, type ContentKind } from '@cp/content';
import { enqueueRealtime, withSystem } from '@cp/db';
import { CATALOG_CHANNEL } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, enqueueInTx, type AnyJobDefinition } from '../boss/define-job';
import { queuePlacePick } from '../jobs/places/pick';
import { contentEmbedJob } from './embed';
import { WRITERS, PublishRefusedError } from './writers';
import { writePersonas, writePlaces } from './writers-guides-places';
import { writeMedia } from './writers-media';

export const contentPublishPayloadSchema = z.object({ release_id: z.uuid() });

export interface PublishResult {
  readonly kind: ContentKind;
  readonly version: number;
  readonly items: number;
  /** The destinations (slugs) a places release wrote to. */
  readonly destinations?: readonly string[];
}

export async function publishRelease(tx: pg.PoolClient, releaseId: string): Promise<PublishResult> {
  const { rows } = await tx.query<{
    kind: ContentKind;
    version: number;
    status: string;
    artifact: unknown;
  }>('SELECT kind, version, status, artifact FROM content_releases WHERE id = $1 FOR UPDATE', [
    releaseId,
  ]);
  const row = rows[0];
  if (row === undefined) throw new PublishRefusedError(`release ${releaseId} does not exist`);
  if (row.status !== 'approved') {
    throw new PublishRefusedError(
      `release ${row.kind} v${row.version} is ${row.status}, not approved`,
    );
  }
  const release = loadRelease(row.artifact, row.kind);
  if (release.version !== row.version) {
    throw new PublishRefusedError(
      `release artifact is v${release.version}, the row is v${row.version}`,
    );
  }
  let destinations: string[] | undefined;
  const writer = WRITERS[row.kind] as
    | ((tx: pg.PoolClient, items: readonly unknown[], releaseId: string) => Promise<void>)
    | undefined;
  if (writer !== undefined) await writer(tx, release.items, releaseId);
  else if (row.kind === 'personas')
    await writePersonas(tx, loadRelease(row.artifact, 'personas').items, row.version);
  else if (row.kind === 'places') {
    const places = loadRelease(row.artifact, 'places').items;
    await writePlaces(tx, places);
    destinations = [...new Set(places.map((place) => place.destination))].sort();
  } else if (row.kind === 'media')
    await writeMedia(tx, loadRelease(row.artifact, 'media').items, releaseId);

  await tx.query(
    "UPDATE content_releases SET status = 'superseded' WHERE kind = $1 AND status = 'published' AND id <> $2",
    [row.kind, releaseId],
  );
  await tx.query(
    "UPDATE content_releases SET status = 'published', stage = 'publish', published_at = now() WHERE id = $1",
    [releaseId],
  );
  await enqueueRealtime(tx, {
    channel: CATALOG_CHANNEL,
    payload: {
      type: 'catalogue.changed',
      kind: 'content',
      content_kind: row.kind,
      version: row.version,
    },
  });
  return {
    kind: row.kind,
    version: row.version,
    items: release.items.length,
    ...(destinations === undefined ? {} : { destinations }),
  };
}

const EMBEDDED_KINDS: ReadonlySet<ContentKind> = new Set(['help', 'insurance']);

export function contentPublishJob(): AnyJobDefinition {
  return defineJob({
    queue: 'content.publish',
    schema: contentPublishPayloadSchema,
    singletonKey: (data) => data.release_id,
    async handler(data, { pool, logger, boss }) {
      try {
        const result = await withSystem(pool, async (tx) => {
          const published = await publishRelease(tx, data.release_id);
          if (EMBEDDED_KINDS.has(published.kind)) {
            await enqueueInTx(tx, contentEmbedJob(), { release_id: data.release_id });
          }
          return published;
        });
        logger.info({ ...result }, 'content release published');
        // After the commit, so a missing queue can never undo a publish.
        for (const slug of result.destinations ?? []) {
          await queuePlacePick(boss, slug, true).catch((error: unknown) =>
            logger.warn({ err: error, slug }, 'places pick not queued after the places release'),
          );
        }
        return { ...result };
      } catch (error) {
        if (!(error instanceof PublishRefusedError || error instanceof ReleaseLoadError))
          throw error;
        await blockRelease(pool, data.release_id, error.message);
        logger.warn(
          { release_id: data.release_id, reason: error.message },
          'content release refused',
        );
        return { refused: error.message };
      }
    },
  });
}

/** Marks a release refused by the publish job as blocked, with the reason, for the console. */
export async function blockRelease(
  pool: pg.Pool,
  releaseId: string,
  reason: string,
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      "UPDATE content_releases SET status = 'blocked', blocked_reason = $2 WHERE id = $1 AND status = 'approved'",
      [releaseId, reason],
    ),
  );
}
