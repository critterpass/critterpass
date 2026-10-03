/**
 * `export.build` (3n-6 "Download my data"): writes one zip of the requester's own data (a JSON
 * file per area, their own uploads under `media/`, a manifest) to `exports/{uid}/{id}.zip`, marks
 * the row ready for seven days and tells its owner (`data_export.ready` → push). A failure marks
 * the row failed, which never counts against the once-a-day limit, so the person can ask again.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  EXPORT_TTL_DAYS,
  exportBuildJobSchema,
  exportExpireJobSchema,
  exportObjectKey,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import type { AvatarMediaStore } from '../avatar/media-store';
import { ownMedia, readSections } from './export-sections';
import { writeZip, type ZipEntry } from './zip';

/** Uploads beyond this many bytes are listed in the manifest instead of copied into the zip. */
export const EXPORT_MEDIA_BUDGET_BYTES = 200 * 1024 * 1024;

export type ExportOutcome = 'ready' | 'failed' | 'skipped';

const README = `This is your CritterPass data.

Each folder holds one part of it as JSON: your profile and settings, your crews and trips, the
messages you wrote, the money and bookings you are part of, your critters, and the photos and voice
notes you uploaded (media/). Other people's data is not in here.

manifest.json lists every file and anything left out.
`;

function baseName(key: string): string {
  return key.split('/').pop() ?? key;
}

async function markFailed(pool: pg.Pool, exportId: string, code: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE data_exports SET status = 'failed', error_code = $2, progress = 0
        WHERE id = $1 AND status IN ('queued', 'building')`,
      [exportId, code],
    ),
  );
}

export async function buildExport(
  pool: pg.Pool,
  store: AvatarMediaStore | null,
  exportId: string,
  logger: JobLogger,
  now: () => Date = () => new Date(),
): Promise<ExportOutcome> {
  const uid = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ user_id: string }>(
      `UPDATE data_exports SET status = 'building', progress = 5
        WHERE id = $1 AND status IN ('queued', 'building') RETURNING user_id`,
      [exportId],
    );
    return rows[0]?.user_id ?? null;
  });
  if (uid === null) return 'skipped';
  if (store === null) {
    await markFailed(pool, exportId, 'storage_unavailable');
    return 'failed';
  }
  try {
    const { sections, media } = await withSystem(pool, async (tx) => ({
      sections: await readSections(tx, uid),
      media: await ownMedia(tx, uid),
    }));
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [{ name: 'README.txt', bytes: encoder.encode(README) }];
    for (const section of sections) {
      entries.push({ name: section.file, bytes: encoder.encode(section.json) });
    }
    const included: string[] = [];
    const left: { key: string; reason: string }[] = [];
    let budget = EXPORT_MEDIA_BUDGET_BYTES;
    for (const item of media) {
      if (item.bytes > budget) {
        left.push({ key: item.key, reason: 'too_large_for_one_export' });
        continue;
      }
      const object = await store.get(item.key);
      if (object === null) {
        left.push({ key: item.key, reason: 'no_longer_stored' });
        continue;
      }
      budget -= object.bytes.length;
      const name = `media/${item.kind}/${baseName(item.key)}`;
      entries.push({ name, bytes: object.bytes });
      included.push(name);
    }
    const manifest = {
      exported_at: now().toISOString(),
      user_id: uid,
      files: sections.map((section) => ({ file: section.file, rows: section.rows })),
      media: included,
      left_out: left,
    };
    entries.push({
      name: 'manifest.json',
      bytes: encoder.encode(JSON.stringify(manifest, null, 2)),
    });

    const archive = writeZip(entries, now());
    const key = exportObjectKey(uid, exportId);
    await store.put(key, archive, 'application/zip');
    const readyAt = now();
    const expiresAt = new Date(readyAt.getTime() + EXPORT_TTL_DAYS * 86_400_000);
    await withSystem(pool, async (tx) => {
      await tx.query(
        `UPDATE data_exports
            SET status = 'ready', r2_key = $2, bytes = $3, progress = 100, ready_at = $4,
                expires_at = $5, error_code = NULL
          WHERE id = $1`,
        [exportId, key, archive.length, readyAt, expiresAt],
      );
      await appendDomainEvent(tx, {
        type: 'data_export.ready',
        aggregateKind: 'user',
        aggregateId: uid,
        actorKind: 'system',
        actorId: null,
        payload: { user_id: uid, export_id: exportId },
      });
    });
    return 'ready';
  } catch (error) {
    logger.error({ export_id: exportId, err: error }, 'data export failed');
    await markFailed(pool, exportId, 'build_failed');
    return 'failed';
  }
}

export function exportBuildJob(store: AvatarMediaStore | null): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.exportBuild,
    schema: exportBuildJobSchema,
    singletonKey: (data) => data.export_id,
    async handler(data, { pool, logger }) {
      return { outcome: await buildExport(pool, store, data.export_id, logger) };
    },
  });
}

/** Ready exports past their seven days: the row reads expired and the zip is deleted. */
export async function expireExports(
  pool: pg.Pool,
  store: AvatarMediaStore | null,
  now: Date = new Date(),
): Promise<number> {
  const due = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; r2_key: string | null }>(
      `UPDATE data_exports SET status = 'expired'
        WHERE status = 'ready' AND expires_at <= $1 RETURNING id, r2_key`,
      [now],
    );
    return rows;
  });
  for (const row of due) {
    if (row.r2_key !== null) await store?.delete(row.r2_key);
  }
  return due.length;
}

export function exportExpireJob(store: AvatarMediaStore | null): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.exportExpire,
    schema: exportExpireJobSchema,
    async handler(_data, { pool }) {
      return { expired: await expireExports(pool, store) };
    },
  });
}
