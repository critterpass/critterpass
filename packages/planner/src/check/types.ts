/**
 * The plan check's inputs and its issues before they are stored: a fit context of the crew's
 * plan (days, timed items, stays, rain, travel), what each item's place is like (our own hours, the
 * crowd week), the bookings with a deadline, and the limits from `plan.check.thresholds`.
 */
import type { CheckFix, CheckIssueKind, CheckSeverity, Hours } from '@cp/domain';

import type { FitContext, FitCrowds } from '../fit/context';

export interface CheckThresholds {
  readonly tooFarDayMin: number;
  readonly tooFarLegMin: number;
  readonly rainPct: number;
  readonly normalRainPct: number;
  readonly busyLevel: number;
  readonly paceStopsPer9h: number;
}

export const DEFAULT_CHECK_THRESHOLDS: CheckThresholds = {
  tooFarDayMin: 180,
  tooFarLegMin: 90,
  rainPct: 50,
  normalRainPct: 40,
  busyLevel: 70,
  paceStopsPer9h: 6,
};

export interface CheckPlace {
  /** Our own `pois.hours`; null = unknown (never called closed). */
  readonly hours: Hours | null;
  readonly crowds: FitCrowds | null;
}

export interface CheckBooking {
  readonly bookingId: string;
  readonly deadline: Date;
  readonly kind: 'free_cancel' | 'hold_expiry';
}

export interface CheckInput {
  readonly context: FitContext;
  /** What each item's place is like, by POI id. */
  readonly places: ReadonlyMap<string, CheckPlace>;
  readonly bookings: readonly CheckBooking[];
  readonly thresholds: CheckThresholds;
  readonly now: Date;
  /** Local minute after which a long drive counts as after dark (18:30). */
  readonly darkFromMin?: number;
  /** Screens that work a fix out with the person, filled by the fixer screens. */
  readonly fixers?: CheckFixers;
}

export interface CheckIssueDraft {
  readonly kind: CheckIssueKind;
  readonly severity: CheckSeverity;
  readonly dayId: string | null;
  readonly dayNo: number | null;
  readonly stableIds: readonly string[];
  readonly params: Record<string, unknown>;
  readonly fix: CheckFix | null;
}

export interface RankedIssue extends CheckIssueDraft {
  readonly rank: number;
  readonly fingerprint: string;
}

/** Decides the fix of an issue that needs a screen; absent kinds get their default screen. */
export type CheckFixers = Partial<
  Record<CheckIssueKind, (issue: CheckIssueDraft, input: CheckInput) => CheckFix | null>
>;
