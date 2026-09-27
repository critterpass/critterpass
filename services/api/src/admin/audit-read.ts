/**
 * Audit log viewer: `ops.admin_audit` read as admin_reader, filtered by operator, action, target and
 * time, newest first in keyset pages, plus the owner-only CSV export. The table is append-only for
 * every role (trigger), so nothing here or anywhere else can change a row.
 */
import {
  AUDIT_EXPORT_MAX_ROWS,
  DomainError,
  auditExportSchema,
  auditFacetsSchema,
  auditPageSchema,
  auditQuerySchema,
  type AuditQuery,
} from '@cp/domain';
import type pg from 'pg';

import { decodeCursor, encodeCursor, withAdminReader } from './reads';
import { defineAdminArea, defineAdminRead, type OperatorDirectory } from './registry';

interface AuditRow {
  id: string;
  at: Date;
  /** `at` at full microsecond precision, for the keyset cursor. */
  at_key: string;
  admin_id: string;
  action: string;
  target_kind: string;
  target_id: string | null;
  reason: string | null;
  op_id: string | null;
  detail: Record<string, unknown> | null;
}

async function queryAudit(
  pool: pg.Pool,
  adminUid: string,
  query: AuditQuery,
  limit: number,
): Promise<AuditRow[]> {
  const cursor = decodeCursor(query.cursor);
  return withAdminReader(pool, adminUid, async (tx) => {
    const { rows } = await tx.query<AuditRow>(
      `SELECT id, at, at::text AS at_key, admin_id, action, target_kind, target_id, reason, op_id, detail
       FROM ops.admin_audit
       WHERE ($1::uuid IS NULL OR admin_id = $1)
         AND ($2::text IS NULL OR action = $2)
         AND ($3::text IS NULL OR target_kind = $3)
         AND ($4::uuid IS NULL OR target_id = $4)
         AND ($5::timestamptz IS NULL OR at >= $5)
         AND ($6::timestamptz IS NULL OR at < $6)
         AND ($7::timestamptz IS NULL OR (at, id) < ($7, $8::uuid))
       ORDER BY at DESC, id DESC LIMIT $9`,
      [
        query.admin ?? null,
        query.action ?? null,
        query.target_kind ?? null,
        query.target_id ?? null,
        query.from ?? null,
        query.to ?? null,
        cursor?.[0] ?? null,
        cursor?.[1] ?? null,
        limit,
      ],
    );
    return rows;
  });
}

async function withEmails(rows: readonly AuditRow[], operators: OperatorDirectory) {
  const emails = await operators.emails([...new Set(rows.map((row) => row.admin_id))]);
  return rows.map(({ at_key: _key, ...row }) => ({
    ...row,
    at: row.at.toISOString(),
    admin: emails.get(row.admin_id) ?? row.admin_id,
  }));
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  // A leading formula character is neutralised so a spreadsheet never evaluates audit text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const CSV_COLUMNS = [
  'at',
  'admin',
  'action',
  'target_kind',
  'target_id',
  'reason',
  'op_id',
  'detail',
] as const;

export function auditArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'audit',
    reads: [
      defineAdminRead({
        path: '/audit',
        area: 'audit',
        summary: 'Admin audit log, newest first, with filters',
        query: auditQuerySchema,
        response: auditPageSchema,
        run: async ({ admin, operators, query }) => {
          const rows = await queryAudit(pool, admin.uid, query, query.limit + 1);
          const page = rows.slice(0, query.limit);
          const last = page.at(-1);
          return auditPageSchema.parse({
            items: await withEmails(page, operators),
            next_cursor:
              rows.length > query.limit && last ? encodeCursor(last.at_key, last.id) : null,
          });
        },
      }),
      defineAdminRead({
        path: '/audit/facets',
        area: 'audit',
        summary: 'Operators and actions present in the audit log, for filters',
        response: auditFacetsSchema,
        run: async ({ admin, operators }) => {
          const { admins, actions } = await withAdminReader(pool, admin.uid, async (tx) => ({
            admins: (
              await tx.query<{ admin_id: string }>('SELECT DISTINCT admin_id FROM ops.admin_audit')
            ).rows.map((row) => row.admin_id),
            actions: (
              await tx.query<{ action: string }>(
                'SELECT DISTINCT action FROM ops.admin_audit ORDER BY action',
              )
            ).rows.map((row) => row.action),
          }));
          const emails = await operators.emails(admins);
          return {
            admins: admins
              .map((uid) => ({ uid, email: emails.get(uid) ?? uid }))
              .sort((a, b) => a.email.localeCompare(b.email)),
            actions,
          };
        },
      }),
      defineAdminRead({
        path: '/audit/export',
        area: 'audit',
        summary: 'CSV export of the filtered audit log (owner only)',
        query: auditQuerySchema,
        response: auditExportSchema,
        run: async ({ admin, operators, query }) => {
          if (!admin.roles.includes('owner'))
            throw new DomainError('FORBIDDEN', { reason: 'role' });
          const rows = await queryAudit(
            pool,
            admin.uid,
            { ...query, cursor: undefined },
            AUDIT_EXPORT_MAX_ROWS + 1,
          );
          const kept = await withEmails(rows.slice(0, AUDIT_EXPORT_MAX_ROWS), operators);
          const lines = [
            CSV_COLUMNS.join(','),
            ...kept.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
          ];
          return {
            filename: `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`,
            rows: kept.length,
            truncated: rows.length > AUDIT_EXPORT_MAX_ROWS,
            csv: `${lines.join('\n')}\n`,
          };
        },
      }),
    ],
    commands: [],
  });
}
