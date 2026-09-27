/**
 * Moderation: the subject-kind handler registry, report intake shared by `report_content` and the
 * input compliance check, and the console area (queue reads plus `moderate_item`).
 *
 * A phase that owns reportable content registers one handler for its kind (`registerModerationKind`):
 * whether a subject exists, its preview, its author (for `ban_author`) and how `hide`/`remove` are
 * carried out. This phase ships the `user` kind (approve or ban the account).
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  REPORT_COLLAPSE_WINDOW_HOURS,
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
import { decodeCursor, encodeCursor, withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

/** Mints a short-lived media Worker URL for an R2 object key (null when signing is not set up). */
export type MediaUrlSigner = (objectKey: string) => Promise<string | null>;

export interface ModerationKindHandler {
  readonly kind: string;
  /** Verdicts this kind can carry out; `approve` is always one of them. */
  readonly verdicts: readonly ModerationVerdict[];
  /** Runs as app_system. */
  readonly exists: (tx: pg.PoolClient, id: string) => Promise<boolean>;
  /** Runs as admin_reader. */
  readonly preview: (
    tx: pg.PoolClient,
    id: string,
    media: MediaUrlSigner,
  ) => Promise<ModerationPreview>;
  /** The subject's author for `ban_author`; runs as app_system. */
  readonly author: (tx: pg.PoolClient, id: string) => Promise<string | null>;
  /** Carries out `hide`/`remove` inside the verdict's transaction, as app_system. */
  readonly apply?: (tx: pg.PoolClient, id: string, verdict: 'hide' | 'remove') => Promise<void>;
}

const kinds = new Map<string, ModerationKindHandler>();

export function registerModerationKind(handler: ModerationKindHandler): void {
  if (kinds.has(handler.kind)) throw new Error(`moderation kind ${handler.kind} is registered`);
  if (!handler.verdicts.includes('approve')) {
    throw new Error(`moderation kind ${handler.kind} must support approve`);
  }
  const needsApply = handler.verdicts.some((verdict) => verdict === 'hide' || verdict === 'remove');
  if (needsApply && handler.apply === undefined) {
    throw new Error(`moderation kind ${handler.kind} hides or removes without an apply`);
  }
  kinds.set(handler.kind, handler);
}

export function moderationKind(kind: string): ModerationKindHandler | undefined {
  return kinds.get(kind);
}

/** An image subject's preview: the media object's signed read URL (admin_reader reads `r2_key`). */
export async function imagePreview(
  tx: pg.PoolClient,
  mediaId: string,
  title: string,
  media: MediaUrlSigner,
): Promise<ModerationPreview> {
  const { rows } = await tx.query<{ r2_key: string }>(
    'SELECT r2_key FROM media_objects WHERE id = $1',
    [mediaId],
  );
  const key = rows[0]?.r2_key;
  if (key === undefined) return { type: 'missing', title };
  return { type: 'image', title, url: await media(key) };
}

registerModerationKind({
  kind: 'user',
  verdicts: ['approve', 'ban_author'],
  exists: async (tx, id) =>
    (await tx.query('SELECT 1 FROM users WHERE id = $1', [id])).rowCount === 1,
  preview: async (tx, id) => {
    const { rows } = await tx.query<{
      display_name: string | null;
      username: string | null;
      status: string;
      member_since: Date | null;
    }>('SELECT display_name, username, status, member_since FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (user === undefined) return { type: 'missing', title: 'Deleted account' };
    return {
      type: 'user',
      title: user.display_name ?? user.username ?? 'Unnamed traveller',
      username: user.username,
      status: user.status,
      member_since: user.member_since?.toISOString() ?? null,
    };
  },
  author: (_tx, id) => Promise.resolve(id),
});

export interface ReportInput {
  readonly kind: string;
  readonly id: string;
  readonly reason: string;
  readonly source: ModerationReportSource;
  /** Null only for `compliance` reports. */
  readonly reporterId: string | null;
}

/**
 * Files one report as app_system. A subject with an open report from the last 24 h collapses into
 * it (`report_count` + 1) instead of opening a new row; the same reporter filing twice counts once.
 */
export async function recordModerationReport(
  tx: pg.PoolClient,
  input: ReportInput,
): Promise<{ report_id: string; collapsed: boolean }> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `moderation:${input.kind}:${input.id}`,
  ]);
  const open = await tx.query<{ id: string }>(
    `SELECT id FROM moderation_reports
     WHERE target_kind = $1 AND target_id = $2 AND status = 'open'
       AND last_reported_at > now() - make_interval(hours => $3)
     ORDER BY last_reported_at DESC LIMIT 1 FOR UPDATE`,
    [input.kind, input.id, REPORT_COLLAPSE_WINDOW_HOURS],
  );
  const existing = open.rows[0]?.id;
  if (existing !== undefined) {
    if (input.reporterId !== null) {
      const filed = await tx.query(
        `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason) VALUES ($1, $2, $3)
         ON CONFLICT (report_id, reporter_id) DO NOTHING`,
        [existing, input.reporterId, input.reason],
      );
      if (filed.rowCount === 0) return { report_id: existing, collapsed: true };
    }
    await tx.query(
      `UPDATE moderation_reports SET report_count = report_count + 1, last_reported_at = now()
       WHERE id = $1`,
      [existing],
    );
    return { report_id: existing, collapsed: true };
  }
  const created = await tx.query<{ id: string }>(
    `INSERT INTO moderation_reports (reporter_id, source, target_kind, target_id, reason)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.reporterId, input.source, input.kind, input.id, input.reason],
  );
  const reportId = created.rows[0]?.id;
  if (reportId === undefined) throw new Error('moderation report insert returned no row');
  if (input.reporterId !== null) {
    await tx.query(
      'INSERT INTO ops.moderation_filings (report_id, reporter_id, reason) VALUES ($1, $2, $3)',
      [reportId, input.reporterId, input.reason],
    );
  }
  return { report_id: reportId, collapsed: false };
}

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
