/**
 * Review stage: a batch that validated (no `fail`) becomes a release in `review` (or `blocked`
 * when it waits on something outside the pipeline, such as a native speaker) with one review row
 * per item carrying its validator report. The checksummed release artifact is also written to
 * batches/<kind>/<batch>.json (with the IP checklist beside it for named kinds), so the same batch
 * can be queued in any environment. Re-running the
 * stage for a batch still under review replaces it in place; an approved batch is never touched.
 */
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { resolveRoute } from '@cp/ai';
import {
  buildRelease,
  itemRef,
  loadRelease,
  parseItems,
  type ContentKind,
  type Release,
} from '@cp/content';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { AnyKindModule, KindContext } from '../kinds/types';
import { checkName } from '../ip/check';
import { runValidators } from '../validators/registry';
import { readJson, writeJson, writeText } from '../work';
import { FACTORY_ROUTE } from './generate';
import { required, StageError, type StageFiles } from './state';

export interface QueuedBatch {
  readonly releaseId: string | null;
  readonly version: number;
  readonly status: 'review' | 'blocked';
  readonly artifact: Release<ContentKind>;
}

async function nextVersion(tx: pg.PoolClient, kind: string, batchKey: string): Promise<number> {
  const { rows } = await tx.query<{ version: number; status: string }>(
    'SELECT version, status FROM content_releases WHERE batch_key = $1',
    [batchKey],
  );
  const existing = rows[0];
  if (existing !== undefined) {
    if (!['draft', 'review', 'blocked'].includes(existing.status)) {
      throw new StageError(`batch ${batchKey} is already ${existing.status}; start a new batch`);
    }
    return existing.version;
  }
  const max = await tx.query<{ max: number | null }>(
    'SELECT max(version) AS max FROM content_releases WHERE kind = $1',
    [kind],
  );
  return (max.rows[0]?.max ?? 0) + 1;
}

/**
 * Where the work files are missing (a clean checkout queueing a batch into another environment),
 * the batch comes from its committed artifact: the checksum is verified and the validator report
 * and IP screen are recomputed from its items, without any model call.
 */
function committedBatch(module: AnyKindModule, files: StageFiles) {
  if (!existsSync(files.paths.artifact)) return undefined;
  const release = loadRelease(readJson<unknown>(files.paths.artifact), module.kind);
  const report = runValidators(module.kind, release.items, module.validators);
  const names =
    module.ipNames === undefined
      ? []
      : release.items.flatMap((item) => [...(module.ipNames?.(item) ?? [])]);
  const ip = [...new Set(names)].map((name) => checkName(name));
  return { release, report, ip };
}

export async function runReview(
  module: AnyKindModule,
  ctx: KindContext,
  files: StageFiles,
  pool: pg.Pool | null,
  log: (line: string) => void = () => undefined,
): Promise<QueuedBatch> {
  const committed = files.report() === undefined ? committedBatch(module, files) : undefined;
  const report = committed?.report ?? required(files.report(), 'validation report');
  if (report.severity === 'fail') {
    throw new StageError(
      `${ctx.batchKey} failed validation (${report.counts.fail} items); it stays out of review`,
    );
  }
  const items =
    committed?.release.items ?? parseItems(module.kind, required(files.items(), 'items'));
  const generated = files.generate();
  const ip = committed?.ip ?? files.ip() ?? [];
  const blockedReason = module.blockedReason?.(items) ?? null;
  const status = blockedReason === null ? 'review' : 'blocked';
  const ipStatus =
    ip.length === 0
      ? 'not_applicable'
      : ip.some((r) => r.status === 'flagged')
        ? 'flagged'
        : 'open';
  const renders = new Map((files.renders() ?? []).map((r) => [r.ref, r.file]));
  const route = module.prompt === undefined ? null : FACTORY_ROUTE;

  const queue = async (tx: pg.PoolClient | null) => {
    const version = tx === null ? 1 : await nextVersion(tx, module.kind, ctx.batchKey);
    const artifact = buildRelease({
      kind: module.kind,
      version,
      items,
      generated_by: committed?.release.generated_by ?? {
        batch_key: ctx.batchKey,
        route,
        model: route === null ? null : resolveRoute(FACTORY_ROUTE).model,
        generated_at: ctx.now.toISOString(),
      },
      approved_by: null,
    });
    // A batch queued from its committed artifact leaves the repo as it is.
    if (committed === undefined) writeJson(files.paths.artifact, artifact);
    if (committed === undefined && module.checklist !== undefined) {
      writeText(
        files.paths.artifact.replace(/\.json$/u, '.checklist.md'),
        module.checklist(ctx, items),
      );
    }
    const checklist = path.join(files.paths.dir, 'ip-checklist.md');
    if (existsSync(checklist)) {
      copyFileSync(checklist, files.paths.artifact.replace(/\.json$/u, '.ip-checklist.md'));
    }
    if (tx === null) return { releaseId: null, version, status, artifact } as const;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, gate, blocked_reason,
         ip_status, checksum, artifact, item_count, agent_job_id)
       VALUES ($1, $2, $3, $4, $5, 'review', $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (batch_key) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status,
         stage = EXCLUDED.stage, gate = EXCLUDED.gate, blocked_reason = EXCLUDED.blocked_reason,
         ip_status = EXCLUDED.ip_status, checksum = EXCLUDED.checksum, artifact = EXCLUDED.artifact,
         item_count = EXCLUDED.item_count, agent_job_id = EXCLUDED.agent_job_id
       RETURNING id`,
      [
        module.kind,
        version,
        ctx.batchKey,
        module.title(ctx),
        status,
        module.gate,
        blockedReason,
        ipStatus,
        artifact.checksum,
        JSON.stringify(artifact),
        items.length,
        generated?.agentJobId ?? null,
      ],
    );
    const releaseId = rows[0]?.id;
    if (releaseId === undefined) throw new StageError('release insert returned no row');
    await tx.query('DELETE FROM ops.content_reviews WHERE release_id = $1', [releaseId]);
    const byRef = new Map(report.items.map((r) => [r.ref, r]));
    for (const item of items) {
      const ref = itemRef(module.kind, item);
      const itemReport = byRef.get(ref);
      await tx.query(
        `INSERT INTO ops.content_reviews (release_id, item_ref, render_key, severity, report)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          releaseId,
          ref,
          renders.get(ref) ?? null,
          itemReport?.severity ?? 'pass',
          JSON.stringify(itemReport?.checks ?? []),
        ],
      );
    }
    return { releaseId, version, status, artifact } as const;
  };

  const queued = pool === null ? await queue(null) : await withSystem(pool, queue);
  log(
    pool === null
      ? `review: wrote ${files.paths.artifact}; set DATABASE_URL to queue it in the ops console`
      : `review: ${module.kind} v${queued.version} is ${queued.status}${blockedReason ? ` (${blockedReason})` : ''}`,
  );
  return queued;
}
