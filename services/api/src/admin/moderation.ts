/**
 * Moderation area: the queue reads (open reports newest first, each with its kind's preview) and
 * `moderate_item`, which applies a verdict to every open report of the subject.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  adminPageSchema,
  moderateItemPayloadSchema,
  moderationQueueItemSchema,
  moderationQueueQuerySchema,
  moderationSummarySchema,
  reportStatusForVerdict,
  type ModerationPreview,
  type ModerationReportSource,
  type ModerationVerdict,
} from '@cp/domain';
import type pg from 'pg';

import type { AccountControl } from './accounts';
import { moderationKind, type MediaUrlSigner } from './moderation-intake';
import { decodeCursor, encodeCursor, withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

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
}

export interface ModerationAreaDeps {
  readonly pool: pg.Pool;
  readonly accounts: AccountControl;
  readonly media: MediaUrlSigner;
}

const queuePageSchema = adminPageSchema(moderationQueueItemSchema);

export function moderationArea(deps: ModerationAreaDeps) {
  return defineAdminArea({
    id: 'moderation',
    reads: [
      defineAdminRead({
        path: '/moderation',
        area: 'moderation',
        summary: 'Moderation queue by status, newest report first',
        query: moderationQueueQuerySchema,
        response: queuePageSchema,
        run: async ({ admin, operators, query }) => {
          const cursor = decodeCursor(query.cursor);
          const { rows, previews } = await withAdminReader(deps.pool, admin.uid, async (tx) => {
            const result = await tx.query<ReportRow>(
              `SELECT id, target_kind, target_id, source, reason, status, report_count,
                      last_reported_at, verdict, decided_by, decided_at
               FROM moderation_reports
               WHERE status = $1 AND ($2::timestamptz IS NULL OR (last_reported_at, id) < ($2, $3::uuid))
               ORDER BY last_reported_at DESC, id DESC LIMIT $4`,
              [query.status, cursor?.[0] ?? null, cursor?.[1] ?? null, query.limit + 1],
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
            return { rows: result.rows, previews: shown };
          });
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
              verdicts: moderationKind(row.target_kind)?.verdicts ?? ['approve'],
              preview: previews[index],
            })),
            next_cursor:
              rows.length > query.limit && last
                ? encodeCursor(last.last_reported_at.toISOString(), last.id)
                : null,
          });
        },
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
        schema: moderateItemPayloadSchema,
        audit: (payload) => ({
          targetKind: payload.kind,
          targetId: payload.id,
          reason: payload.note,
          detail: { verdict: payload.verdict },
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
            await deps.accounts.ban(banned, { reason: payload.note ?? 'moderation', until: null });
          }
          return { reports: ids.length, status: reportStatusForVerdict(payload.verdict) };
        },
      }),
    ],
  });
}
