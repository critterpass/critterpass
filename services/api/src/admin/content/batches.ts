/**
 * Content batch reads (as `admin_reader`): the batch list with validator counts, reviewer verdicts
 * and the generation cost rolled up from the batch's agent job, the live release per kind, and one
 * batch's items side by side with the same items in the live release.
 */
import { itemRef, parseItems, type ContentKind } from '@cp/content';
import {
  contentBatchDetailSchema,
  contentBatchListSchema,
  DomainError,
  type ContentBatchSummary,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { withAdminReader } from '../reads';
import { defineAdminRead, type AnyAdminRead } from '../registry';

const SUMMARY_SQL = `
  SELECT r.id::text, r.kind, r.version, r.batch_key, r.title, r.status, r.stage, r.gate,
    r.blocked_reason, r.ip_status, r.item_count, r.notes,
    r.artifact -> 'generated_by' ->> 'route' AS route,
    r.artifact -> 'generated_by' ->> 'model' AS model,
    coalesce(u.tokens, 0)::int AS tokens, coalesce(u.cost, 0)::bigint AS cost_micros,
    coalesce(c.pass, 0)::int AS pass, coalesce(c.warn, 0)::int AS warn, coalesce(c.fail, 0)::int AS fail,
    coalesce(c.pending, 0)::int AS pending, coalesce(c.keep, 0)::int AS keep,
    coalesce(c.reject, 0)::int AS reject,
    r.created_at, r.approved_at, r.published_at
  FROM content_releases r
  LEFT JOIN LATERAL (
    SELECT sum(tokens_in + tokens_out) AS tokens, sum(cost_micros) AS cost
    FROM ai_usage WHERE r.agent_job_id IS NOT NULL AND job_id = r.agent_job_id
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE severity = 'pass') AS pass,
      count(*) FILTER (WHERE severity = 'warn') AS warn,
      count(*) FILTER (WHERE severity = 'fail') AS fail,
      count(*) FILTER (WHERE verdict = 'pending') AS pending,
      count(*) FILTER (WHERE verdict = 'keep') AS keep,
      count(*) FILTER (WHERE verdict = 'reject') AS reject
    FROM ops.content_reviews WHERE release_id = r.id
  ) c ON true`;

type SummaryRow = Record<string, unknown> & {
  created_at: Date;
  approved_at: Date | null;
  published_at: Date | null;
  cost_micros: string | number;
};

function toSummary(row: SummaryRow): ContentBatchSummary {
  const iso = (value: Date | null) => (value === null ? null : value.toISOString());
  return {
    id: row['id'] as string,
    kind: row['kind'] as ContentBatchSummary['kind'],
    version: row['version'] as number,
    batch_key: row['batch_key'] as string,
    title: row['title'] as string,
    status: row['status'] as ContentBatchSummary['status'],
    stage: row['stage'] as ContentBatchSummary['stage'],
    gate: row['gate'] as string | null,
    blocked_reason: row['blocked_reason'] as string | null,
    ip_status: row['ip_status'] as ContentBatchSummary['ip_status'],
    item_count: row['item_count'] as number,
    severity: {
      pass: row['pass'] as number,
      warn: row['warn'] as number,
      fail: row['fail'] as number,
    },
    verdicts: {
      pending: row['pending'] as number,
      keep: row['keep'] as number,
      reject: row['reject'] as number,
    },
    route: row['route'] as string | null,
    model: row['model'] as string | null,
    tokens: row['tokens'] as number,
    cost_micros: Number(row.cost_micros),
    notes: row['notes'] as string | null,
    created_at: row.created_at.toISOString(),
    approved_at: iso(row.approved_at),
    published_at: iso(row.published_at),
  };
}

function itemsOf(kind: ContentKind, artifact: unknown): Map<string, Record<string, unknown>> {
  const raw = (artifact as { items?: unknown[] } | null)?.items ?? [];
  const items = parseItems(kind, raw);
  return new Map(items.map((item) => [itemRef(kind, item), item as Record<string, unknown>]));
}

export function contentReads(pool: pg.Pool): readonly AnyAdminRead[] {
  return [
    defineAdminRead({
      path: '/content/batches',
      area: 'content',
      summary: 'Content batches waiting for review, newest first, and the live release per kind',
      response: contentBatchListSchema,
      run: ({ admin }) =>
        withAdminReader(pool, admin.uid, async (tx) => {
          const { rows } = await tx.query<SummaryRow>(
            `${SUMMARY_SQL}
             ORDER BY (r.status IN ('review', 'blocked')) DESC, r.updated_at DESC LIMIT 100`,
          );
          const live = await tx.query<{ kind: string; version: number; published_at: Date | null }>(
            "SELECT kind, version, published_at FROM content_releases WHERE status = 'published' ORDER BY kind",
          );
          return contentBatchListSchema.parse({
            items: rows.map(toSummary),
            live: live.rows.map((row) => ({
              ...row,
              published_at: row.published_at?.toISOString() ?? null,
            })),
          });
        }),
    }),
    defineAdminRead({
      path: '/content/batches/{id}',
      area: 'content',
      summary: 'One content batch: items, validator reports, verdicts and the live version of each',
      params: z.object({ id: z.uuid() }),
      response: contentBatchDetailSchema,
      run: ({ admin, params }) =>
        withAdminReader(pool, admin.uid, async (tx) => {
          const { rows } = await tx.query<SummaryRow & { artifact: unknown }>(
            `${SUMMARY_SQL.replace('SELECT r.id::text,', 'SELECT r.artifact, r.id::text,')} WHERE r.id = $1`,
            [params.id],
          );
          const row = rows[0];
          if (row === undefined) throw new DomainError('NOT_FOUND');
          const summary = toSummary(row);
          const live = await tx.query<{ version: number; artifact: unknown }>(
            "SELECT version, artifact FROM content_releases WHERE kind = $1 AND status = 'published'",
            [summary.kind],
          );
          const previous = itemsOf(summary.kind, live.rows[0]?.artifact ?? null);
          const reviews = await tx.query<{
            item_ref: string;
            severity: 'pass' | 'warn' | 'fail';
            report: unknown;
            verdict: 'pending' | 'keep' | 'reject';
            notes: string | null;
          }>(
            'SELECT item_ref, severity, report, verdict, notes FROM ops.content_reviews WHERE release_id = $1',
            [params.id],
          );
          const byRef = new Map(reviews.rows.map((r) => [r.item_ref, r]));
          const items = [...itemsOf(summary.kind, row.artifact)].map(([ref, item]) => {
            const review = byRef.get(ref);
            return {
              ref,
              severity: review?.severity ?? 'pass',
              checks: review?.report ?? [],
              verdict: review?.verdict ?? 'pending',
              notes: review?.notes ?? null,
              item,
              previous: previous.get(ref) ?? null,
            };
          });
          return contentBatchDetailSchema.parse({
            ...summary,
            items,
            live_version: live.rows[0]?.version ?? null,
          });
        }),
    }),
  ];
}
