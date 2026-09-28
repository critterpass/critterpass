/**
 * Turns detected visits into `record_visit` commands through the offline-capable command client:
 * one op when the user arrives (so crew quests and copresence can see it), and one with `left_at`
 * for the same visit id when they leave. Expense and manual check-ins use `recordVisit` directly.
 */
import {
  generateUuidV7,
  VISIT_DETECTION_VERSION,
  type RecordVisitPayload,
  type VisitSource,
} from '@cp/domain';

import type { DetectedVisit } from './detector';

/** The `record_visit` command as the app's command client sends it (offline-capable). */
export const RECORD_VISIT = { name: 'record_visit', offline: true } as const;
/** The `delete_visit` command. */
export const DELETE_VISIT = { name: 'delete_visit', offline: true } as const;

export type RecordVisitSender = (payload: RecordVisitPayload) => Promise<unknown>;

export function createVisitQueue(options: {
  readonly send: RecordVisitSender;
  readonly tripId: () => string | null;
  readonly track?: (source: VisitSource) => void;
}) {
  /** Visit ids of arrivals still open, per POI, so the departure closes the same row. */
  const open = new Map<string, { readonly visitId: string; readonly tripId: string }>();

  function payload(
    visitId: string,
    tripId: string,
    visit: DetectedVisit,
    leftAt: number | null,
  ): RecordVisitPayload {
    return {
      visit_id: visitId,
      trip_id: tripId,
      poi_id: visit.poiId,
      source: 'geofence',
      arrived_at: new Date(visit.arrivedAt).toISOString(),
      ...(leftAt !== null ? { left_at: new Date(leftAt).toISOString() } : {}),
      evidence: {
        dwell_s: visit.dwellS,
        acc: visit.acc,
        mock_flags: visit.mockFlags,
        detection_version: VISIT_DETECTION_VERSION,
      },
    };
  }

  return {
    async arrived(visit: DetectedVisit): Promise<void> {
      const tripId = options.tripId();
      if (tripId === null) return;
      const visitId = generateUuidV7();
      open.set(visit.poiId, { visitId, tripId });
      await options.send(payload(visitId, tripId, visit, null));
      options.track?.('geofence');
    },
    async left(visit: DetectedVisit): Promise<void> {
      const entry = open.get(visit.poiId);
      open.delete(visit.poiId);
      const tripId = entry?.tripId ?? options.tripId();
      if (tripId === null) return;
      await options.send(payload(entry?.visitId ?? generateUuidV7(), tripId, visit, visit.leftAt));
    },
    /** Expense or manual check-in at a POI (no evidence: an explicit user action). */
    async recordVisit(input: {
      readonly source: Exclude<VisitSource, 'geofence'>;
      readonly poiId: string;
      readonly at?: number;
    }): Promise<string | null> {
      const tripId = options.tripId();
      if (tripId === null) return null;
      const visitId = generateUuidV7();
      await options.send({
        visit_id: visitId,
        trip_id: tripId,
        poi_id: input.poiId,
        source: input.source,
        arrived_at: new Date(input.at ?? Date.now()).toISOString(),
      });
      options.track?.(input.source);
      return visitId;
    },
  };
}

export type VisitQueue = ReturnType<typeof createVisitQueue>;
