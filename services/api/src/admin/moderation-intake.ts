/**
 * Moderation intake: the subject-kind handler registry and report filing shared by
 * `report_content` and the input compliance check.
 *
 * A phase that owns reportable content registers one handler for its kind (`registerModerationKind`):
 * whether a subject exists, its preview, its author (for `ban_author`) and how `hide`/`remove` are
 * carried out. The `user` kind (approve or ban the account) ships here. Also reads the author card.
 */
import {
  DomainError,
  REPORT_COLLAPSE_WINDOW_HOURS,
  type ModerationAuthor,
  stripPatterns,
  type ModerationPreview,
  type ModerationReportSource,
  type ModerationVerdict,
} from '@cp/domain';
import type pg from 'pg';

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
  /** Releases a subject held for review (e.g. a pending avatar) when approved, as app_system. */
  readonly approve?: (tx: pg.PoolClient, id: string) => Promise<void>;
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
  /** The reporter's note (≤ 280 characters); contact details and links are cut out before storing. */
  readonly note?: string | null;
}

/** Hours from the first filing until a report is due, unless `moderation.sla_hours` says otherwise. */
export const DEFAULT_MODERATION_SLA_HOURS = 24;

async function slaHours(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM ops.ops_config WHERE key = 'moderation.sla_hours'",
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MODERATION_SLA_HOURS;
}

/** The note as stored: screened for contact details and links, null when nothing is left. */
export function screenReportNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  const screened = stripPatterns(note).text.slice(0, 280);
  return screened.length > 0 ? screened : null;
}

/**
 * Files one report as app_system. A subject with an open report from the last 24 h collapses into
 * it (`report_count` + 1) instead of opening a new row; the same reporter filing twice counts once.
 * A new report records its subject's author (from the kind handler) and its due time; every
 * counted filing adds to `reason_counts`.
 */
export async function recordModerationReport(
  tx: pg.PoolClient,
  input: ReportInput,
): Promise<{ report_id: string; collapsed: boolean }> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `moderation:${input.kind}:${input.id}`,
  ]);
  const note = screenReportNote(input.note);
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
        `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (report_id, reporter_id) DO NOTHING`,
        [existing, input.reporterId, input.reason, note],
      );
      if (filed.rowCount === 0) return { report_id: existing, collapsed: true };
    }
    await tx.query(
      `UPDATE moderation_reports SET report_count = report_count + 1, last_reported_at = now(),
         reason_counts = jsonb_set(reason_counts, ARRAY[$2::text],
           to_jsonb(coalesce((reason_counts ->> $2)::int, 0) + 1))
       WHERE id = $1`,
      [existing, input.reason],
    );
    return { report_id: existing, collapsed: true };
  }
  const author = await moderationKind(input.kind)?.author(tx, input.id);
  const created = await tx.query<{ id: string }>(
    `INSERT INTO moderation_reports
       (reporter_id, source, target_kind, target_id, reason, author_id, due_at, reason_counts)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7), jsonb_build_object($5::text, 1))
     RETURNING id`,
    [
      input.reporterId,
      input.source,
      input.kind,
      input.id,
      input.reason,
      author ?? null,
      await slaHours(tx),
    ],
  );
  const reportId = created.rows[0]?.id;
  if (reportId === undefined) throw new Error('moderation report insert returned no row');
  if (input.reporterId !== null) {
    await tx.query(
      `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason, note)
       VALUES ($1, $2, $3, $4)`,
      [reportId, input.reporterId, input.reason, note],
    );
  }
  return { report_id: reportId, collapsed: false };
}

/** The author card: identity, active crews, reports against them and past verdicts (admin_reader). */
export async function readModerationAuthor(
  tx: pg.PoolClient,
  uid: string,
): Promise<ModerationAuthor> {
  const { rows } = await tx.query<{
    display_name: string | null;
    username: string | null;
    status: string;
    created_at: Date;
  }>('SELECT display_name, username, status, created_at FROM users WHERE id = $1', [uid]);
  const user = rows[0];
  if (user === undefined) throw new DomainError('NOT_FOUND');
  const crews = await tx.query<{ id: string; name: string; role: string }>(
    `SELECT c.id, c.name, m.role FROM crew_members m JOIN crews c ON c.id = m.crew_id
     WHERE m.user_id = $1 AND m.status = 'active' ORDER BY c.name`,
    [uid],
  );
  const against = await tx.query<{ total: number; open: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'open')::int AS open
     FROM moderation_reports WHERE author_id = $1`,
    [uid],
  );
  const verdicts = await tx.query<{
    report_id: string;
    target_kind: string;
    target_id: string;
    reason: string;
    verdict: ModerationVerdict;
    decided_at: Date;
  }>(
    `SELECT id AS report_id, target_kind, target_id, reason, verdict, decided_at
     FROM moderation_reports
     WHERE author_id = $1 AND verdict IS NOT NULL AND decided_at IS NOT NULL
     ORDER BY decided_at DESC LIMIT 50`,
    [uid],
  );
  return {
    uid,
    display_name: user.display_name,
    username: user.username,
    status: user.status,
    joined_at: user.created_at.toISOString(),
    crews: crews.rows,
    reports_against: against.rows[0] ?? { total: 0, open: 0 },
    verdicts: verdicts.rows.map((row) => ({ ...row, decided_at: row.decided_at.toISOString() })),
  };
}
