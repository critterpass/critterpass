/**
 * "Download my data" (3n-6, docs/data-model.md §3.17 `data_exports`): one export in flight per
 * person, one request a day, a zip of only the requester's own rows and uploads at
 * `exports/{uid}/{id}.zip`, readable for seven days.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';

export const EXPORT_TTL_DAYS = 7;
export const EXPORT_COOLDOWN_HOURS = 24;

export const DATA_EXPORT_STATUSES = ['queued', 'building', 'ready', 'expired', 'failed'] as const;
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

export const requestDataExportPayloadSchema = z.object({ export_id: uuidV7Schema }).strict();
export type RequestDataExportPayload = z.infer<typeof requestDataExportPayloadSchema>;

export interface RequestDataExportResult {
  readonly export_id: string;
}

export const exportBuildJobSchema = z.object({ export_id: z.uuid() }).strict();
export type ExportBuildJob = z.infer<typeof exportBuildJobSchema>;

export function exportObjectKey(uid: string, exportId: string): string {
  return `exports/${uid}/${exportId}.zip`;
}

/** When the person may ask again after an export requested at `requestedAt` (unless it failed). */
export function exportCooldownUntil(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + EXPORT_COOLDOWN_HOURS * 3_600_000);
}

export const dataExportLinkSchema = z.object({
  url: z.url(),
  /** When this link stops working (a fresh one can be asked for until the export expires). */
  link_expires_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  bytes: z.number().int().nonnegative().nullable(),
});
export type DataExportLink = z.infer<typeof dataExportLinkSchema>;
