/**
 * Incident and maintenance banners (docs/api-contracts.md §4.17, §5.9): ops post, update and
 * resolve them; every console page shows the open ones newest first (`GET /v1/admin/banners`).
 * While a `read_only` maintenance window is open the api refuses every console command except
 * updating or resolving a banner; the owner's emergency CLI is not refused.
 */
import { z } from 'zod';

export const INCIDENT_KINDS = ['incident', 'maintenance'] as const;
export const incidentKindSchema = z.enum(INCIDENT_KINDS);
export type IncidentKind = z.infer<typeof incidentKindSchema>;

/** Commands that still run during a read-only maintenance window. */
export const MAINTENANCE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  'update_incident',
  'resolve_incident',
]);

const bannerText = z.string().trim().min(1).max(400);
const runbookUrl = z
  .url({ protocol: /^https$/ })
  .max(500)
  .nullish();

export const postIncidentPayloadSchema = z
  .object({
    kind: incidentKindSchema,
    text: bannerText,
    runbook_url: runbookUrl,
    starts_at: z.iso.datetime({ offset: true }).nullish(),
    ends_at: z.iso.datetime({ offset: true }).nullish(),
    read_only: z.boolean().default(false),
  })
  .refine((value) => !value.read_only || value.kind === 'maintenance', {
    message: 'only maintenance can be read-only',
    path: ['read_only'],
  });
export type PostIncidentPayload = z.infer<typeof postIncidentPayloadSchema>;

export const updateIncidentPayloadSchema = z.object({
  id: z.uuid(),
  text: bannerText.optional(),
  runbook_url: runbookUrl,
  ends_at: z.iso.datetime({ offset: true }).nullish(),
  read_only: z.boolean().optional(),
});
export type UpdateIncidentPayload = z.infer<typeof updateIncidentPayloadSchema>;

export const resolveIncidentPayloadSchema = z.object({ id: z.uuid() });

export const bannerSchema = z.object({
  id: z.uuid(),
  kind: incidentKindSchema,
  text: z.string(),
  runbook_url: z.string().nullable(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }).nullable(),
  read_only: z.boolean(),
  posted_by: z.string().nullable(),
  posted_at: z.iso.datetime({ offset: true }),
});
export type Banner = z.infer<typeof bannerSchema>;

export const bannersResponseSchema = z.object({
  items: z.array(bannerSchema),
  /** The on-call stamp: the `ops.on_call` config value, or null when unset. */
  on_call: z.string().nullable(),
});
export type BannersResponse = z.infer<typeof bannersResponseSchema>;

/** Whether a command may run now, given the open banners. The CLI door is never refused. */
export function maintenanceAllows(
  command: string,
  via: 'admin' | 'cli',
  open: readonly Pick<Banner, 'kind' | 'read_only'>[],
): boolean {
  if (via === 'cli' || MAINTENANCE_ALLOWED_COMMANDS.has(command)) return true;
  return !open.some((banner) => banner.kind === 'maintenance' && banner.read_only);
}
