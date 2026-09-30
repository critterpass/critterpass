/**
 * Data export (3n-6 "Download my data", docs/api-contracts.md §4.1 `request_data_export`,
 * docs/api-contracts-async.md §2.2 `export.build`): one zip of the requester's own data, delivered
 * by a signed link that lapses after seven days. Other people's C3 data and supplier content never
 * enter it.
 */
import { z } from 'zod';

export const EXPORT_LINK_TTL_DAYS = 7;
/** A new export may be requested once a day, and only when none is in flight. */
export const EXPORT_COOLDOWN_HOURS = 24;

export const DATA_EXPORT_STATUSES = ['queued', 'building', 'ready', 'expired', 'failed'] as const;
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

/** One JSON file per section in the zip (`<section>.json`), in this order. */
export const EXPORT_SECTIONS = [
  'profile',
  'settings',
  'taste',
  'crews',
  'trips',
  'plans',
  'chat',
  'money',
  'bookings',
  'stamps',
  'critters',
  'consents',
  'feedback',
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export const requestDataExportPayloadSchema = z.object({ export_id: z.uuid().optional() }).strict();
export type RequestDataExportPayload = z.infer<typeof requestDataExportPayloadSchema>;

export const dataExportResultSchema = z.object({
  export_id: z.uuid(),
  status: z.enum(DATA_EXPORT_STATUSES),
});
export type DataExportResult = z.infer<typeof dataExportResultSchema>;

/** `GET /v1/me/export/{id}` */
export const dataExportLinkSchema = z.object({
  export_id: z.uuid(),
  status: z.enum(DATA_EXPORT_STATUSES),
  url: z.url().nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  bytes: z.number().int().nonnegative().nullable(),
});
export type DataExportLink = z.infer<typeof dataExportLinkSchema>;

/** R2 key of an export's zip; everything under `exports/{uid}/` goes at purge. */
export function exportObjectKey(uid: string, exportId: string): string {
  return `exports/${uid}/${exportId}.zip`;
}

export function exportPrefix(uid: string): string {
  return `exports/${uid}/`;
}
