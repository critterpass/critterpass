/**
 * The plan check: deterministic rules over the crew's plan (clashes, closures, long drives, rain,
 * crowds, a packed day, booking deadlines), ranked, each with a fingerprint and a fix: ops to
 * apply in one tap, a screen that works it out with the person, or nothing. No model is called.
 * The fixers (../fixers) decide which screen an issue opens unless the caller passes its own.
 */
import { instantAt } from '../draft/schedule-day';
import { PLAN_CHECK_FIXERS } from '../fixers/index';
import { rankIssues } from './rank';
import { clashIssues } from './rules/clash';
import { closedIssues } from './rules/closed';
import { bookingNotes, paceIssues } from './rules/know';
import { checkDays } from './rules/shared';
import { tooFarIssues } from './rules/too-far';
import { crowdIssues, rainIssues } from './rules/weather';
import type { CheckInput, CheckIssueDraft, RankedIssue } from './types';

function withFixers(issue: CheckIssueDraft, input: CheckInput): CheckIssueDraft {
  const fixer = (input.fixers ?? PLAN_CHECK_FIXERS)[issue.kind];
  return fixer === undefined ? issue : { ...issue, fix: fixer(issue, input) };
}

export function checkPlan(input: CheckInput): RankedIssue[] {
  const days = checkDays(input);
  const first = input.context.days[0];
  const tripStart = first === undefined ? null : instantAt(first.date, 0, input.context.tz);
  const issues = [
    ...days.flatMap((day) => [
      ...clashIssues(day),
      ...closedIssues(day),
      ...tooFarIssues(day),
      ...rainIssues(day),
      ...crowdIssues(day),
      ...paceIssues(day),
    ]),
    ...bookingNotes(input, tripStart),
  ].map((issue) => withFixers(issue, input));
  return rankIssues(issues);
}

export { fingerprintOf } from './fingerprint';
export {
  aroundOf,
  quietKey,
  splitQuiet,
  type QuietDay,
  type QuietMark,
  type QuietSplit,
  type QuietSubject,
} from './quiet';
export {
  MIN_SAVING_MIN,
  PLAN_CHECK_FIXERS,
  tooFarAlternative,
  type TooFarAlternative,
  type TooFarCandidate,
} from '../fixers/index';
export { MAX_MOVABLE_STOPS, reorderDay, type DayReorder, type ReorderSlot } from '../reorder/index';
export { routeDrive } from '../reorder/route';
export {
  SWAP_REASONS,
  swapDay,
  type BlockProblem,
  type DaySwap,
  type DaySwaps,
  type SwapBlock,
  type SwapReason,
} from '../swaps/index';
export { feasibleStart, retimeOp } from './retime';
export {
  DEFAULT_CHECK_THRESHOLDS,
  type CheckBooking,
  type CheckFixers,
  type CheckInput,
  type CheckIssueDraft,
  type CheckPlace,
  type CheckThresholds,
  type RankedIssue,
} from './types';
