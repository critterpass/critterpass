/**
 * Content batch commands (docs/api-contracts.md §4.17). Reviewers keep or reject items and reject
 * whole batches with notes (fed into the next generation run); the owner approves, which merges the
 * batch into the live release of its kind (rejected items keep their live version) and queues
 * `content.publish`; the owner can also roll a kind back to an earlier release, which the same job
 * publishes in one transaction.
 */
import { buildRelease, itemRef, loadRelease, parseItems, type ContentKind } from '@cp/content';
import { sendInTx } from '@cp/db';
import {
  approveContentBatchPayloadSchema,
  DomainError,
  rejectContentBatchPayloadSchema,
  reviewContentItemPayloadSchema,
  rollbackContentReleasePayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineAdminCommand, type AnyAdminCommand } from '../registry';

export const CONTENT_PUBLISH_QUEUE = 'content.publish';

interface ReleaseRow {
  id: string;
  kind: ContentKind;
  version: number;
  status: string;
  ip_status: string;
  artifact: unknown;
}

async function lockRelease(tx: pg.PoolClient, id: string): Promise<ReleaseRow> {
  const { rows } = await tx.query<ReleaseRow>(
    'SELECT id, kind, version, status, ip_status, artifact FROM content_releases WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND');
  return row;
}

function requireOpen(row: ReleaseRow): void {
  if (row.status !== 'review' && row.status !== 'blocked') {
    throw new DomainError('STATE_INVALID', { reason: 'not_in_review', status: row.status });
  }
}

async function enqueuePublish(tx: pg.PoolClient, releaseId: string): Promise<void> {
  await sendInTx(tx, CONTENT_PUBLISH_QUEUE, { release_id: releaseId }, { singletonKey: releaseId });
}

/** The live release with the batch laid over it: kept items replace or add, rejected ones stay live. */
async function mergedItems(tx: pg.PoolClient, row: ReleaseRow): Promise<unknown[]> {
  const batch = loadRelease(row.artifact, row.kind);
  const live = await tx.query<{ artifact: unknown }>(
    "SELECT artifact FROM content_releases WHERE kind = $1 AND status = 'published'",
    [row.kind],
  );
  const liveItems =
    live.rows[0] === undefined ? [] : loadRelease(live.rows[0].artifact, row.kind).items;
  const rejected = await tx.query<{ item_ref: string }>(
    "SELECT item_ref FROM ops.content_reviews WHERE release_id = $1 AND verdict = 'reject'",
    [row.id],
  );
  const rejectedRefs = new Set(rejected.rows.map((r) => r.item_ref));
  const merged = new Map(liveItems.map((item) => [itemRef(row.kind, item), item as unknown]));
  for (const item of batch.items) {
    const ref = itemRef(row.kind, item);
    if (!rejectedRefs.has(ref)) merged.set(ref, item);
  }
  return parseItems(row.kind, [...merged.values()]);
}

export function contentCommands(): readonly AnyAdminCommand[] {
  return [
    defineAdminCommand({
      name: 'review_content_item',
      schema: reviewContentItemPayloadSchema,
      audit: (payload) => ({
        targetKind: 'content_release',
        targetId: payload.batch_id,
        reason: payload.notes ?? null,
        detail: { item_ref: payload.item_ref, verdict: payload.verdict },
      }),
      async handle(tx, payload, ctx) {
        requireOpen(await lockRelease(tx, payload.batch_id));
        const { rowCount } = await tx.query(
          `UPDATE ops.content_reviews SET verdict = $3, notes = $4, reviewer = $5, reviewed_at = now()
           WHERE release_id = $1 AND item_ref = $2`,
          [
            payload.batch_id,
            payload.item_ref,
            payload.verdict,
            payload.notes ?? null,
            ctx.admin.uid,
          ],
        );
        if (rowCount === 0) throw new DomainError('NOT_FOUND');
        return { item_ref: payload.item_ref, verdict: payload.verdict };
      },
    }),
    defineAdminCommand({
      name: 'reject_content_batch',
      schema: rejectContentBatchPayloadSchema,
      audit: (payload) => ({
        targetKind: 'content_release',
        targetId: payload.batch_id,
        reason: payload.notes,
      }),
      async handle(tx, payload) {
        requireOpen(await lockRelease(tx, payload.batch_id));
        await tx.query(
          "UPDATE content_releases SET status = 'rejected', blocked_reason = NULL, notes = $2 WHERE id = $1",
          [payload.batch_id, payload.notes],
        );
        return { status: 'rejected' };
      },
    }),
    defineAdminCommand({
      name: 'approve_content_batch',
      schema: approveContentBatchPayloadSchema,
      audit: (payload, result: { version: number }) => ({
        targetKind: 'content_release',
        targetId: payload.batch_id,
        reason: payload.notes ?? null,
        detail: { version: result.version, ip_signed_off: payload.ip_signed_off ?? false },
      }),
      async handle(tx, payload, ctx) {
        const row = await lockRelease(tx, payload.batch_id);
        if (row.status === 'blocked') {
          throw new DomainError('STATE_INVALID', { reason: 'blocked' });
        }
        requireOpen(row);
        if (row.ip_status === 'flagged') {
          throw new DomainError('STATE_INVALID', { reason: 'ip_flagged' });
        }
        if (row.ip_status === 'open' && payload.ip_signed_off !== true) {
          throw new DomainError('STATE_INVALID', { reason: 'ip_checklist_open' });
        }
        const batch = loadRelease(row.artifact, row.kind);
        const artifact = buildRelease({
          kind: row.kind,
          version: row.version,
          items: (await mergedItems(tx, row)) as never,
          generated_by: batch.generated_by,
          approved_by: ctx.admin.uid,
        });
        await tx.query(
          `UPDATE content_releases SET status = 'approved', stage = 'approve', approved_by = $2, approved_at = now(),
             checksum = $3, artifact = $4, item_count = $5, notes = coalesce($6, notes),
             ip_status = CASE WHEN ip_status = 'open' THEN 'clear' ELSE ip_status END
           WHERE id = $1`,
          [
            row.id,
            ctx.admin.uid,
            artifact.checksum,
            JSON.stringify(artifact),
            artifact.items.length,
            payload.notes ?? null,
          ],
        );
        await enqueuePublish(tx, row.id);
        return { release_id: row.id, version: row.version };
      },
    }),
    defineAdminCommand({
      name: 'rollback_content_release',
      schema: rollbackContentReleasePayloadSchema,
      audit: (payload, result: { release_id: string }) => ({
        targetKind: 'content_release',
        targetId: result.release_id,
        detail: { kind: payload.kind, to_version: payload.to_version },
      }),
      async handle(tx, payload) {
        const { rows } = await tx.query<{ id: string; status: string }>(
          'SELECT id, status FROM content_releases WHERE kind = $1 AND version = $2 FOR UPDATE',
          [payload.kind, payload.to_version],
        );
        const target = rows[0];
        if (target === undefined) throw new DomainError('NOT_FOUND');
        if (target.status !== 'superseded') {
          throw new DomainError('STATE_INVALID', {
            reason: 'not_a_previous_release',
            status: target.status,
          });
        }
        await tx.query(
          "UPDATE content_releases SET status = 'approved', stage = 'approve' WHERE id = $1",
          [target.id],
        );
        await enqueuePublish(tx, target.id);
        return { release_id: target.id, version: payload.to_version };
      },
    }),
  ];
}
