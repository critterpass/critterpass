/**
 * Who saved a console-edited row last, for a stale save's answer: a `VERSION_CONFLICT` carries
 * `updated_by_uid` and `updated_at` from the row's latest audit entry, and the command route turns
 * the uid into the operator's email (`updated_by`) so the console can say who saved and when.
 */
import type pg from 'pg';

export interface LastSave {
  readonly updated_by_uid: string | null;
  readonly updated_at: string | null;
}

export type SavedSubject =
  /** A row audited by its uuid. */
  | { readonly targetId: string }
  /** A keyed row (config key, partner): its command and the detail field that names it. */
  | { readonly action: string; readonly field: string; readonly value: string };

export async function lastSave(tx: pg.PoolClient, subject: SavedSubject): Promise<LastSave> {
  const { rows } = await ('targetId' in subject
    ? tx.query<{ admin_id: string | null; at: Date }>(
        `SELECT admin_id, at FROM ops.admin_audit WHERE target_id = $1 ORDER BY at DESC LIMIT 1`,
        [subject.targetId],
      )
    : tx.query<{ admin_id: string | null; at: Date }>(
        `SELECT admin_id, at FROM ops.admin_audit
          WHERE action = $1 AND detail->>$2 = $3 ORDER BY at DESC LIMIT 1`,
        [subject.action, subject.field, subject.value],
      ));
  const row = rows[0];
  return { updated_by_uid: row?.admin_id ?? null, updated_at: row?.at.toISOString() ?? null };
}

/** The conflict detail the console reads: the uid replaced by the operator's email. */
export async function nameLastSaver(
  detail: unknown,
  emails: (uids: readonly string[]) => Promise<ReadonlyMap<string, string>>,
): Promise<unknown> {
  if (typeof detail !== 'object' || detail === null || !('updated_by_uid' in detail)) return detail;
  const { updated_by_uid: uid, ...rest } = detail as Record<string, unknown>;
  const email = typeof uid === 'string' ? ((await emails([uid])).get(uid) ?? null) : null;
  return { ...rest, updated_by: email };
}
