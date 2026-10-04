/**
 * The plan check's fixers: which screen works an issue out with the person, decided by the fixer
 * engines over the same input the rules read. A clash that the day's best order also clears, with
 * less driving, opens Less driving (7h-3), as does a too-far day that order brings under the
 * limit; rain and crowds open Rain and crowds (7h-4) only when a swap exists for that block, and
 * offer nothing otherwise. Anything else keeps the rule's own fix. Each day is worked out once per
 * check run.
 */
import type { CheckFix } from '@cp/domain';

import type { CheckFixers, CheckInput, CheckIssueDraft } from '../check/types';
import { reorderDay, type DayReorder } from '../reorder/index';
import { swapDay, type DaySwaps } from '../swaps/index';

const memo = new WeakMap<CheckInput, Map<string, DayReorder | DaySwaps | null>>();

function once<T extends DayReorder | DaySwaps>(
  input: CheckInput,
  key: string,
  run: () => T | null,
): T | null {
  const cache = memo.get(input) ?? new Map<string, DayReorder | DaySwaps | null>();
  memo.set(input, cache);
  if (!cache.has(key)) cache.set(key, run());
  return (cache.get(key) ?? null) as T | null;
}

const reorderOf = (input: CheckInput, dayId: string) =>
  once<DayReorder>(input, `reorder:${dayId}`, () => reorderDay(input, dayId));

const swapsOf = (input: CheckInput, dayId: string) =>
  once<DaySwaps>(input, `swaps:${dayId}`, () => swapDay(input, dayId));

const LESS_DRIVING: CheckFix = { kind: 'screen', screen: 'less_driving' };
const RAIN_CROWDS: CheckFix = { kind: 'screen', screen: 'rain_crowds' };

/** Whether the new order puts the clashing pair apart, travel between them included. */
function clearsClash(reorder: DayReorder, issue: CheckIssueDraft): boolean {
  const [first, second] = issue.stableIds;
  const a = reorder.after.schedule.find((slot) => slot.stableId === first);
  const b = reorder.after.schedule.find((slot) => slot.stableId === second);
  if (a === undefined || b === undefined) return false;
  const [early, late] = a.start <= b.start ? [a, b] : [b, a];
  return early.end <= late.start && reorder.ops.length > 0;
}

function swapFix(issue: CheckIssueDraft, input: CheckInput): CheckFix | null {
  if (issue.dayId === null) return issue.fix;
  const swaps = swapsOf(input, issue.dayId);
  const target = issue.stableIds[0];
  return swaps?.swaps.some((swap) => swap.stableId === target) === true
    ? RAIN_CROWDS
    : { kind: 'none' };
}

export const PLAN_CHECK_FIXERS: CheckFixers = {
  clash: (issue, input) => {
    if (issue.dayId === null) return issue.fix;
    const reorder = reorderOf(input, issue.dayId);
    return reorder !== null && clearsClash(reorder, issue) ? LESS_DRIVING : issue.fix;
  },
  too_far: (issue, input) => {
    if (issue.dayId === null) return issue.fix;
    const reorder = reorderOf(input, issue.dayId);
    return reorder !== null && reorder.after.driveMin <= input.thresholds.tooFarDayMin
      ? LESS_DRIVING
      : issue.fix;
  },
  rain: swapFix,
  crowds: swapFix,
};

export {
  tooFarAlternative,
  MIN_SAVING_MIN,
  type TooFarAlternative,
  type TooFarCandidate,
} from './too-far';
