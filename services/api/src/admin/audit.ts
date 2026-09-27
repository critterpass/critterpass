/**
 * `ops.admin_audit` writes (docs/data-model.md §3.16). Every console command writes exactly one row
 * inside the command's own transaction, so a rolled-back command leaves no trace and an applied one
 * can never lose its audit row. The operator's IP is stored only as a keyed hash.
 */
import { createHmac } from 'node:crypto';

import type pg from 'pg';

export interface AdminAuditEntry {
  readonly adminId: string;
  readonly action: string;
  readonly targetKind: string;
  /** Only uuid subjects fit the column; keyed subjects (config keys, partners) go in `detail`. */
  readonly targetId: string | null;
  readonly reason: string | null;
  readonly opId: string | null;
  readonly detail: Readonly<Record<string, unknown>> | null;
  readonly ipHash: string | null;
}

export async function writeAdminAudit(tx: pg.PoolClient, entry: AdminAuditEntry): Promise<void> {
  await tx.query(
    `INSERT INTO ops.admin_audit
       (admin_id, action, target_kind, target_id, reason, op_id, detail, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.adminId,
      entry.action,
      entry.targetKind,
      entry.targetId,
      entry.reason,
      entry.opId,
      entry.detail === null ? null : JSON.stringify(entry.detail),
      entry.ipHash,
    ],
  );
}

/** Keyed so a leaked audit table cannot be reversed into operator IPs by brute force. */
export function hashAdminIp(secret: string, ip: string | null | undefined): string | null {
  if (ip === null || ip === undefined || ip.length === 0) return null;
  return createHmac('sha256', secret).update(`admin-ip:${ip}`).digest('hex');
}
