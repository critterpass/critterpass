/**
 * POI visit detection on the device: one domain visit machine per planned POI, fed with the
 * engine's fixes (distance to the POI, accuracy) and ticks. An arrival and a departure are the
 * only things that leave the device, as a `record_visit` with aggregate evidence (dwell seconds,
 * worst accuracy, spoof flags) — never the fixes themselves.
 */
import {
  distanceM,
  INITIAL_VISIT_STATE,
  stepVisit,
  visitParamsFor,
  type PoiCategory,
  type VisitInput,
  type VisitParams,
  type VisitState,
} from '@cp/domain';

import type { VisitCandidate } from '../bridge-inputs';
import type { EngineFix } from '../ports';

/** Beyond this, a POI's machine is not stepped at all (it cannot be arriving). */
const WATCH_DISTANCE_M = 2000;

export interface DetectedVisit {
  readonly poiId: string;
  readonly category: PoiCategory;
  readonly arrivedAt: number;
  readonly leftAt: number | null;
  readonly dwellS: number;
  /** Worst accuracy among the fixes that counted toward the visit. */
  readonly acc: number;
  readonly mockFlags: number;
}

interface Tracked {
  state: VisitState;
  readonly params: VisitParams;
  readonly candidate: VisitCandidate;
  worstAcc: number;
  mock: number;
}

export interface DetectorOptions {
  readonly onArrived: (visit: DetectedVisit) => void;
  readonly onLeft: (visit: DetectedVisit) => void;
  /** Server-configured dwell per category, overriding the domain defaults. */
  readonly dwellMsFor?: (category: PoiCategory) => number | undefined;
}

export function createVisitDetector(options: DetectorOptions) {
  const tracked = new Map<string, Tracked>();

  function visitOf(
    entry: Tracked,
    arrivedAt: number,
    leftAt: number | null,
    at: number,
  ): DetectedVisit {
    return {
      poiId: entry.candidate.id,
      category: entry.candidate.category,
      arrivedAt,
      leftAt,
      dwellS: Math.max(0, Math.round(((leftAt ?? at) - arrivedAt) / 1000)),
      acc: entry.worstAcc,
      mockFlags: entry.mock,
    };
  }

  function step(entry: Tracked, input: VisitInput): void {
    const before = entry.state.phase;
    const { state, emit } = stepVisit(entry.state, input, entry.params);
    entry.state = state;
    if (before === 'outside' && state.phase === 'candidate') {
      entry.worstAcc = 0;
      entry.mock = 0;
    }
    if (
      input.type === 'fix' &&
      state.phase !== 'outside' &&
      input.accuracyM <= entry.params.maxAccuracyM
    ) {
      entry.worstAcc = Math.max(entry.worstAcc, input.accuracyM);
    }
    if (emit?.type === 'arrived') options.onArrived(visitOf(entry, emit.arrivedAt, null, input.at));
    if (emit?.type === 'left')
      options.onLeft(visitOf(entry, emit.arrivedAt, emit.leftAt, input.at));
  }

  return {
    /** Replaces the POIs watched; a POI still planned keeps its state (and an open visit). */
    setCandidates(candidates: readonly VisitCandidate[]): void {
      const next = new Set(candidates.map((c) => c.id));
      for (const id of [...tracked.keys()]) if (!next.has(id)) tracked.delete(id);
      for (const candidate of candidates) {
        if (tracked.has(candidate.id)) continue;
        const dwellMs = options.dwellMsFor?.(candidate.category);
        tracked.set(candidate.id, {
          state: INITIAL_VISIT_STATE,
          params: visitParamsFor(candidate.category, candidate.radiusM, dwellMs ? { dwellMs } : {}),
          candidate,
          worstAcc: 0,
          mock: 0,
        });
      }
    },
    onFix(fix: EngineFix): void {
      for (const entry of tracked.values()) {
        const distance = distanceM(entry.candidate, fix);
        if (distance > WATCH_DISTANCE_M && entry.state.phase === 'outside') continue;
        // Spoof flags of every fix that counted toward the visit ride along as evidence.
        if (entry.state.phase !== 'outside' || distance <= entry.params.radiusM)
          entry.mock |= fix.mock;
        step(entry, { type: 'fix', at: fix.at, distanceM: distance, accuracyM: fix.acc });
      }
    },
    tick(at: number): void {
      for (const entry of tracked.values()) step(entry, { type: 'tick', at });
    },
    /** The POI the user is inside right now, if any. */
    current(): { readonly poiId: string; readonly category: PoiCategory } | null {
      for (const entry of tracked.values()) {
        if (entry.state.phase === 'inside' || entry.state.phase === 'leaving') {
          return { poiId: entry.candidate.id, category: entry.candidate.category };
        }
      }
      return null;
    },
    reset(): void {
      tracked.clear();
    },
  };
}

export type VisitDetector = ReturnType<typeof createVisitDetector>;
