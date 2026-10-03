/**
 * The plan check: deterministic rules over the crew's plan (clashes, closures, long drives, rain,
 * crowds, a packed day, booking deadlines), ranked, each with a fingerprint and a fix: ops to
 * apply in one tap, a screen that works it out with the person, or nothing. No model is called.
 */
import { instantAt } from '../draft/schedule-day';
import { rankIssues } from './rank';
import { clashIssues } from './rules/clash';
import { closedIssues } from './rules/closed';
import { bookingNotes, paceIssues } from './rules/know';
import { checkDays } from './rules/shared';
import { tooFarIssues } from './rules/too-far';
import { crowdIssues, rainIssues } from './rules/weather';
import type { CheckInput, CheckIssueDraft, RankedIssue } from './types';

function withFixers(issue: CheckIssueDraft, input: CheckInput): CheckIssueDraft {
  const fixer = input.fixers?.[issue.kind];
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
