/**
 * Runs the visit detector on the engine's stream while the user has consented and a trip plan
 * exists: arrivals and departures become `record_visit` ops, the current POI feeds
 * `useCurrentVisit`, and a minute tick lets a resting phone finish its dwell. One bridge runs
 * app-wide (the route layer mounts it), so the queue is a module singleton.
 */
import type { PoiCategory, RecordVisitPayload, VisitSource } from '@cp/domain';
import { useEffect } from 'react';

import type { DayPlan } from '../bridge-inputs';
import type { LocationEngine } from '../engine';
import { createVisitDetector } from './detector';
import { createVisitQueue } from './queue';
import { setCurrentVisit } from './use-current-visit';

export interface VisitBridgeDeps {
  readonly engine: LocationEngine;
  readonly plan: DayPlan | null;
  readonly consentGranted: boolean;
  readonly send: (payload: RecordVisitPayload) => Promise<unknown>;
  readonly dwellMsFor?: (category: PoiCategory) => number | undefined;
  readonly track?: (source: VisitSource) => void;
  readonly now?: () => number;
}

const live: {
  tripId: string | null;
  send: ((payload: RecordVisitPayload) => Promise<unknown>) | null;
  track: ((source: VisitSource) => void) | null;
} = { tripId: null, send: null, track: null };

const queue = createVisitQueue({
  send: (payload) =>
    live.send ? live.send(payload) : Promise.reject(new Error('no session to record the visit')),
  tripId: () => live.tripId,
  track: (source) => live.track?.(source),
});

/** Expense and manual check-ins (money and quests call this with the POI). */
export function recordVisit(input: {
  readonly source: Exclude<VisitSource, 'geofence'>;
  readonly poiId: string;
  readonly at?: number;
}): Promise<string | null> {
  return queue.recordVisit(input);
}

export function useVisitBridge(deps: VisitBridgeDeps): void {
  const tripId = deps.plan?.context.tripId ?? null;
  useEffect(() => {
    live.tripId = tripId;
    live.send = deps.send;
    live.track = deps.track ?? null;
  }, [tripId, deps.send, deps.track]);

  const candidates = deps.plan?.candidates;
  const { engine, consentGranted, dwellMsFor } = deps;
  const now = deps.now ?? Date.now;
  useEffect(() => {
    if (!consentGranted || candidates === undefined) {
      setCurrentVisit(null);
      return undefined;
    }
    const detector = createVisitDetector({
      onArrived: (visit) => void queue.arrived(visit).catch(() => undefined),
      onLeft: (visit) => void queue.left(visit).catch(() => undefined),
      ...(dwellMsFor ? { dwellMsFor } : {}),
    });
    detector.setCandidates(candidates);
    const refresh = () => setCurrentVisit(detector.current());
    const unsubscribe = engine.subscribe('visit', {
      onFix: (fix) => {
        detector.onFix(fix);
        refresh();
      },
      onRegion: () => {
        detector.tick(now());
        refresh();
      },
    });
    const timer = setInterval(() => {
      detector.tick(now());
      refresh();
    }, 60_000);
    return () => {
      clearInterval(timer);
      unsubscribe();
      setCurrentVisit(null);
    };
    // `now` defaults to Date.now; a caller passing its own keeps it stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, consentGranted, candidates, dwellMsFor]);
}
