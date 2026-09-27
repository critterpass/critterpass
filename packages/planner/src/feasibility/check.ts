/**
 * The one feasibility check drafts, edits and the guide's `fit_check` share. Any hard violation
 * makes a plan `clash`; soft ones (a chronotype window) or thin slack between items make it
 * `tight`; otherwise it `fits`.
 */
import { chronotypeViolations } from './chronotype';
import { gridViolations } from './grid';
import { hoursViolations } from './hours';
import { bookingViolations, mustDoViolations } from './must-dos';
import { timelineViolations } from './travel';
import {
  DEFAULT_CHRONOTYPE_WINDOWS,
  VIOLATION_CODES,
  type FeasibilityInput,
  type FitStatus,
  type Violation,
  type ViolationCode,
} from './types';

export interface FeasibilityResult {
  readonly status: Exclude<FitStatus, 'unknown'>;
  readonly violations: readonly Violation[];
  readonly tight: readonly string[];
}

/** Chronotype windows are preferences: they make a plan tight, never impossible. */
export const SOFT_VIOLATION_CODES: ReadonlySet<ViolationCode> = new Set(['CHRONOTYPE']);

const DEFAULT_GRID_MIN = 15;
const DEFAULT_TIGHT_SLACK_MIN = 15;

export function checkFeasibility(input: FeasibilityInput): FeasibilityResult {
  const timeline = timelineViolations(
    input.items,
    input.members,
    input.travel,
    input.tightSlackMin ?? DEFAULT_TIGHT_SLACK_MIN,
  );
  const violations = [
    ...gridViolations(input.items, input.gridMin ?? DEFAULT_GRID_MIN),
    ...hoursViolations(input.items),
    ...timeline.violations,
    ...chronotypeViolations(
      input.items,
      input.members,
      input.chronotypes ?? {},
      input.windows ?? DEFAULT_CHRONOTYPE_WINDOWS,
    ),
    ...mustDoViolations(input.items, input.mustDos ?? []),
    ...bookingViolations(input.items, input.bookings ?? []),
  ].sort(
    (a, b) =>
      VIOLATION_CODES.indexOf(a.code) - VIOLATION_CODES.indexOf(b.code) ||
      (a.stableId ?? '').localeCompare(b.stableId ?? ''),
  );
  const soft = violations.filter((v) => SOFT_VIOLATION_CODES.has(v.code));
  const tight = [
    ...new Set([...timeline.tight, ...soft.flatMap((v) => (v.stableId ? [v.stableId] : []))]),
  ].sort();
  const hard = violations.length > soft.length;
  return {
    status: hard ? 'clash' : tight.length > 0 ? 'tight' : 'fits',
    violations,
    tight,
  };
}
