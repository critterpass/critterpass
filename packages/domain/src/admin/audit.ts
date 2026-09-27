/**
 * Audit log and operator contracts (docs/api-contracts.md §5.9): the read-only `ops.admin_audit`
 * viewer with filters and keyset pages, the owner's CSV export, and `set_admin_role`.
 */
import { z } from 'zod';

import { adminPageSchema } from './commands';
import { adminRoleSchema } from './roles';

const isoDate = z.iso.datetime({ offset: true });

export const auditQuerySchema = z.object({
  admin: z.uuid().optional(),
  action: z.string().min(1).max(80).optional(),
  target_kind: z.string().min(1).max(40).optional(),
  target_id: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  at: isoDate,
  admin_id: z.uuid(),
  admin: z.string(),
  action: z.string(),
  target_kind: z.string(),
  target_id: z.uuid().nullable(),
  reason: z.string().nullable(),
  op_id: z.uuid().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = adminPageSchema(auditEntrySchema);

export const auditFacetsSchema = z.object({
  admins: z.array(z.object({ uid: z.uuid(), email: z.string() })),
  actions: z.array(z.string()),
});

/** Rows one export may hold; narrow the filters for more. */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

export const auditExportSchema = z.object({
  filename: z.string(),
  rows: z.number().int().nonnegative(),
  truncated: z.boolean(),
  csv: z.string(),
});

export const operatorSchema = z.object({
  uid: z.uuid(),
  email: z.string(),
  name: z.string(),
  roles: z.array(adminRoleSchema),
  allow_listed: z.boolean(),
});
export const operatorsResponseSchema = z.object({ items: z.array(operatorSchema) });
export type Operator = z.infer<typeof operatorSchema>;

export const setAdminRolePayloadSchema = z.object({
  uid: z.uuid(),
  roles: z.array(adminRoleSchema).max(4),
  reason: z.string().trim().min(3).max(500),
});
