/**
 * Wire schemas for the location surfaces: `record_visit` / `delete_visit` commands and the
 * `POST /v1/loc` fix batch. Visits carry a POI and two instants, never coordinates; fixes exist
 * only while a share is active and live for minutes.
 */
import { z } from 'zod';

import { MOCK_FLAGS_MAX } from './plausibility';

export const VISIT_SOURCES = ['geofence', 'expense', 'manual'] as const;
export const visitSourceSchema = z.enum(VISIT_SOURCES);
export type VisitSource = z.infer<typeof visitSourceSchema>;

/** Bumped when the on-device detector's rules change, so outcomes can be re-read per version. */
export const VISIT_DETECTION_VERSION = 1;

const mockFlagsSchema = z.int().min(0).max(MOCK_FLAGS_MAX);

export const recordVisitPayloadSchema = z
  .object({
    /** Client-generated UUIDv7, so a replayed op and a retried queue item land on one row. */
    visit_id: z.uuid(),
    trip_id: z.uuid(),
    poi_id: z.uuid(),
    source: visitSourceSchema,
    arrived_at: z.iso.datetime({ offset: true }),
    left_at: z.iso.datetime({ offset: true }).optional(),
    /** Aggregates only: how long the dwell lasted and the worst accuracy during it. */
    evidence: z
      .object({
        dwell_s: z.int().min(0).max(86_400),
        acc: z.number().min(0).max(10_000),
        mock_flags: mockFlagsSchema.default(0),
        detection_version: z.int().min(1).max(32_767).default(VISIT_DETECTION_VERSION),
      })
      .optional(),
  })
  .refine((v) => v.left_at === undefined || Date.parse(v.left_at) >= Date.parse(v.arrived_at), {
    message: 'left_at must not be before arrived_at',
    path: ['left_at'],
  })
  .refine((v) => v.source !== 'geofence' || v.evidence !== undefined, {
    message: 'geofence visits carry evidence',
    path: ['evidence'],
  });
export type RecordVisitPayload = z.infer<typeof recordVisitPayloadSchema>;

export interface RecordVisitResult {
  readonly visit_id: string;
}

export const deleteVisitPayloadSchema = z.object({ visit_id: z.uuid() });
export type DeleteVisitPayload = z.infer<typeof deleteVisitPayloadSchema>;

export const LOCATION_ACTIVITIES = [
  'unknown',
  'stationary',
  'walking',
  'running',
  'cycling',
  'automotive',
] as const;
export const locationActivitySchema = z.enum(LOCATION_ACTIVITIES);
export type LocationActivity = z.infer<typeof locationActivitySchema>;

export const locationFixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  acc: z.number().min(0).max(100_000),
  activity: locationActivitySchema.default('unknown'),
  at: z.iso.datetime({ offset: true }),
  /** Anti-spoof bits (`MOCK_FLAG_*`); stored, never a reason to drop a share fix. */
  mock: mockFlagsSchema.default(0),
});
export type LocationFix = z.infer<typeof locationFixSchema>;

/** At most one batch per 5 s per user (SOS exempt), so a batch holds a few seconds of fixes. */
export const LOCATION_BATCH_MAX = 20;

export const locationBatchSchema = z.object({
  share_id: z.uuid(),
  fixes: z.array(locationFixSchema).min(1).max(LOCATION_BATCH_MAX),
});
export type LocationBatch = z.infer<typeof locationBatchSchema>;

export const LOCATION_SHARE_REASONS = ['crew_map', 'help', 'sos'] as const;
export const locationShareReasonSchema = z.enum(LOCATION_SHARE_REASONS);
export type LocationShareReason = z.infer<typeof locationShareReasonSchema>;

/** Fixes older than this are purged unless their share is an open SOS. */
export const LOCATION_FIX_TTL_MS = 15 * 60_000;
/** After an SOS share ends its fixes stay this long, for the responders' follow-up. */
export const SOS_FIX_RETENTION_MS = 24 * 60 * 60_000;
/** A visit expires this long after its trip is archived. */
export const VISIT_TTL_AFTER_ARCHIVE_DAYS = 30;
