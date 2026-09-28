/**
 * The standard `ops.admin_audit.detail` every console command writes (docs/data-model.md §3.16): a
 * human summary, a before/after diff, the door it came through (`admin` console or the emergency
 * `cli`) and the roles the operator held. Command-specific keys (`key`, `verdict`, ...) sit beside
 * them. Rows written before this shape existed have no detail and stay valid.
 */
import { z } from 'zod';

import { adminRoleSchema } from './roles';

export const ADMIN_AUDIT_VIA = ['admin', 'cli'] as const;
export const adminAuditViaSchema = z.enum(ADMIN_AUDIT_VIA);
export type AdminAuditVia = z.infer<typeof adminAuditViaSchema>;

export const auditChangeSchema = z.object({
  field: z.string().min(1).max(80),
  before: z.unknown(),
  after: z.unknown(),
});
export type AuditChange = z.infer<typeof auditChangeSchema>;

export const auditDetailSchema = z.looseObject({
  summary: z.string().min(1).max(200),
  changes: z.array(auditChangeSchema),
  via: adminAuditViaSchema,
  roles: z.array(adminRoleSchema).min(1),
});
export type AuditDetail = z.infer<typeof auditDetailSchema>;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The fields whose value differs between `before` and `after`, in `fields` order. */
export function changesFrom(
  before: Readonly<Record<string, unknown>> | null | undefined,
  after: Readonly<Record<string, unknown>> | null | undefined,
  fields: readonly string[],
): AuditChange[] {
  return fields.flatMap((field) => {
    const was = before?.[field] ?? null;
    const now = after?.[field] ?? null;
    return same(was, now) ? [] : [{ field, before: was, after: now }];
  });
}

/** `set_feature_flag` → "Set feature flag"; the fallback label when a command gives none. */
export function humanizeAdminAction(action: string): string {
  const words = action.replace(/[._]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Renders a changed value for a one-line summary ("30 → 40"). */
export function auditValueLabel(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** One `set_feature_flag` of a key, newest first in `GET /v1/admin/flags/{key}/history`. */
export const flagHistoryEntrySchema = z.object({
  at: z.iso.datetime({ offset: true }),
  admin: z.string(),
  summary: z.string(),
  changes: z.array(auditChangeSchema),
  reason: z.string().nullable(),
  via: adminAuditViaSchema.nullable(),
});
export type FlagHistoryEntry = z.infer<typeof flagHistoryEntrySchema>;
export const flagHistoryResponseSchema = z.object({ items: z.array(flagHistoryEntrySchema) });
