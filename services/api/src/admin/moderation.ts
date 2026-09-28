/**
 * Moderation area: the queue reads (open reports newest first, each with its kind's preview, one
 * kind at a time or all, with counts per kind), the author card (identity, crews, reports against
 * and past verdicts) and `moderate_item`, which applies a verdict to every open report of the
 * subject; `ban_author` takes the ban's reason and optional expiry.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  adminPageSchema,
  moderationSummarySchema,
  moderateItemWithBanSchema,
  moderationAuthorSchema,
  moderationQueueEntrySchema,
  moderationQueueFilterSchema,
  reportStatusForVerdict,
  type ModerationPreview,
  type ModerationReportSource,
  type ModerationVerdict,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import type { AccountControl } from './accounts';
import { moderationKind, readModerationAuthor, type MediaUrlSigner } from './moderation-intake';
import { decodeCursor, encodeCursor, withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminCommand,
  defineAdminRead,
  type AdminWorkSource,
} from './registry';
import { openItemsCount } from './work';

interface ReportRow {
  id: string;
  target_kind: string;
  target_id: string;
  source: ModerationReportSource;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
  report_count: number;
  last_reported_at: Date;
  verdict: ModerationVerdict | null;
  decided_by: string | null;
  decided_at: Date | null;
  author_id: string | null;
  assignee_admin_id: string | null;
  due_at: Date | null;
  reason_counts: Record<string, number>;
}

export interface ModerationAreaDeps {
  readonly pool: pg.Pool;
  readonly accounts: AccountControl;
  readonly media: MediaUrlSigner;
}

const queuePageSchema = adminPageSchema(moderationQueueEntrySchema).extend({
  /** Reports in the requested status per kind, whatever `kind` filter is applied. */
  counts: z.record(z.string(), z.number().int()),
});

/** Open reports as a claimable queue, due soonest first, assigned through `assignee_admin_id`. */
function moderationWorkSource(): AdminWorkSource {
  return {
    queue: 'moderation',
    area: 'moderation',
    closes: { action: 'moderate_item' },
    async open(tx, ids) {
      const { rows } = await tx.query<{
        id: string;
        target_kind: string;
        reason: string;
        report_count: number;
        due_at: Date | null;
        assignee_admin_id: string | null;
      }>(
        `SELECT id, target_kind, reason, report_count, due_at, assignee_admin_id
         FROM moderation_reports
         WHERE status = 'open' AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
         ORDER BY due_at NULLS LAST, id LIMIT 500`,
        [ids ?? null],
      );
      return rows.map((row) => ({
        item_id: row.id,
        title: `${row.target_kind.replace(/_/g, ' ')} · ${row.reason} (${row.report_count})`,
        due_at: row.due_at,
        assignee: row.assignee_admin_id,
      }));
    },
    async assign(tx, itemId, adminUid) {
      await tx.query('UPDATE moderation_reports SET assignee_admin_id = $2 WHERE id = $1', [
        itemId,
        adminUid,
      ]);
    },
  };
}

export function moderationArea(deps: ModerationAreaDeps) {
  const work = moderationWorkSource();
  return defineAdminArea({
    id: 'moderation',
    work,
    count: { area: 'moderation', run: async (tx, now) => openItemsCount(await work.open(tx), now) },
    reads: [
      defineAdminRead({
        path: '/moderation',
        area: 'moderation',
        summary: 'Moderation queue by status, newest report first',
        query: moderationQueueFilterSchema,
        response: queuePageSchema,
        run: async ({ admin, operators, query }) => {
          const cursor = decodeCursor(query.cursor);
          const { rows, previews, counts } = await withAdminReader(
            deps.pool,
            admin.uid,
            async (tx) => {
              const result = await tx.query<ReportRow>(
                `SELECT id, target_kind, target_id, source, reason, status, report_count,
                      last_reported_at, verdict, decided_by, decided_at, author_id,
                      assignee_admin_id, due_at, reason_counts
               FROM moderation_reports
               WHERE status = $1 AND ($5::text IS NULL OR target_kind = $5)
                 AND ($2::timestamptz IS NULL OR (last_reported_at, id) < ($2, $3::uuid))
               ORDER BY last_reported_at DESC, id DESC LIMIT $4`,
                [
                  query.status,
                  cursor?.[0] ?? null,
                  cursor?.[1] ?? null,
                  query.limit + 1,
                  query.kind ?? null,
                ],
              );
              const perKind = await tx.query<{ target_kind: string; n: number }>(
                `SELECT target_kind, count(*)::int AS n FROM moderation_reports
               WHERE status = $1 GROUP BY target_kind`,
                [query.status],
              );
              const page = result.rows.slice(0, query.limit);
              const shown: ModerationPreview[] = [];
              for (const row of page) {
                const handler = moderationKind(row.target_kind);
                shown.push(
                  handler === undefined
                    ? { type: 'missing', title: `Unregistered kind ${row.target_kind}` }
                    : await handler.preview(tx, row.target_id, deps.media),
                );
              }
              return {
                rows: result.rows,
                previews: shown,
                counts: Object.fromEntries(perKind.rows.map((row) => [row.target_kind, row.n])),
              };
            },
          );
          const page = rows.slice(0, query.limit);
          const deciders = await operators.emails(
            page.flatMap((row) => (row.decided_by ? [row.decided_by] : [])),
          );
          const last = page.at(-1);
          return queuePageSchema.parse({
            items: page.map((row, index) => ({
              ...row,
              last_reported_at: row.last_reported_at.toISOString(),
              decided_at: row.decided_at?.toISOString() ?? null,
              decided_by: row.decided_by ? (deciders.get(row.decided_by) ?? row.decided_by) : null,
              due_at: row.due_at?.toISOString() ?? null,
              verdicts: moderationKind(row.target_kind)?.verdicts ?? ['approve'],
              preview: previews[index],
            })),
            next_cursor:
              rows.length > query.limit && last
                ? encodeCursor(last.last_reported_at.toISOString(), last.id)
                : null,
            counts,
          });
        },
      }),
      defineAdminRead({
        path: '/moderation/authors/{uid}',
        area: 'moderation',
        summary: 'A reported author: identity, crews, reports against them and past verdicts',
        params: z.object({ uid: z.uuid() }),
        response: moderationAuthorSchema,
        run: ({ admin, params }) =>
          withAdminReader(deps.pool, admin.uid, (tx) => readModerationAuthor(tx, params.uid)),
      }),
      defineAdminRead({
        path: '/moderation/summary',
        area: 'moderation',
        summary: 'Open moderation reports',
        response: moderationSummarySchema,
        run: async ({ admin }) => {
          const { rows } = await withAdminReader(deps.pool, admin.uid, (tx) =>
            tx.query<{ open: number }>(
              "SELECT count(*)::int AS open FROM moderation_reports WHERE status = 'open'",
            ),
          );
          return { open: rows[0]?.open ?? 0 };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'moderate_item',
        schema: moderateItemWithBanSchema,
        audit: (payload, result: { reports: number }) => ({
          targetKind: payload.kind,
          targetId: payload.id,
          reason: payload.note,
          detail: { verdict: payload.verdict, ...(payload.ban ? { ban: payload.ban } : {}) },
          summary: `${payload.kind} · ${payload.verdict} (${result.reports} report${result.reports === 1 ? '' : 's'})`,
          changes: [
            { field: 'status', before: 'open', after: reportStatusForVerdict(payload.verdict) },
          ],
        }),
        handle: async (tx, payload, ctx) => {
          const handler = moderationKind(payload.kind);
          if (handler === undefined) {
            throw new DomainError('VALIDATION', { reason: 'unknown_kind', kind: payload.kind });
          }
          if (!handler.verdicts.includes(payload.verdict)) {
            throw new DomainError('VALIDATION', { reason: 'verdict_unsupported' });
          }
          const open = await tx.query<{ id: string }>(
            `SELECT id FROM moderation_reports
             WHERE target_kind = $1 AND target_id = $2 AND status = 'open' FOR UPDATE`,
            [payload.kind, payload.id],
          );
          if (open.rows.length === 0) {
            throw new DomainError('STATE_INVALID', { reason: 'no_open_report' });
          }
          let banned: string | null = null;
          if (payload.verdict === 'ban_author') {
            banned = await handler.author(tx, payload.id);
            if (banned === null) throw new DomainError('STATE_INVALID', { reason: 'no_author' });
          } else if (payload.verdict === 'hide' || payload.verdict === 'remove') {
            await handler.apply?.(tx, payload.id, payload.verdict);
          } else if (payload.verdict === 'approve') {
            await handler.approve?.(tx, payload.id);
          }
          const ids = open.rows.map((row) => row.id);
          await tx.query(
            `UPDATE moderation_reports
             SET status = $2, verdict = $3, decided_by = $4, decided_at = now()
             WHERE id = ANY($1::uuid[])`,
            [ids, reportStatusForVerdict(payload.verdict), payload.verdict, ctx.admin.uid],
          );
          for (const reportId of ids) {
            await appendDomainEvent(tx, {
              type: 'moderation.decided',
              aggregateKind: 'moderation_report',
              aggregateId: reportId,
              actorKind: 'system',
              actorId: ctx.admin.uid,
              payload: {
                report_id: reportId,
                target_kind: payload.kind,
                target_id: payload.id,
                verdict: payload.verdict,
              },
            });
          }
          // Last: the account change is outside this transaction, so every check above runs first.
          if (banned !== null) {
            await deps.accounts.ban(banned, {
              reason: payload.ban?.reason ?? payload.note ?? 'moderation',
              until: payload.ban?.expires_at ? new Date(payload.ban.expires_at) : null,
            });
          }
          return { reports: ids.length, status: reportStatusForVerdict(payload.verdict) };
        },
      }),
    ],
  });
}
