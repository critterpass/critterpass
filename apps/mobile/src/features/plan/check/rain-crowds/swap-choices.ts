/**
 * Rain and crowds (7h-4) as choices: the forecast watch's open weather move for the day comes first
 * and stands for its blocks (one source for the day's weather swaps, the same the day plan's note
 * shows), then the check's own swaps for the other blocks. Every swap starts ticked; unticking one
 * keeps that block where it is, and a trade's two blocks tick together (one without the other
 * would land on top of it). The ticked swaps are the ops USE ALL applies; unticking every weather
 * swap turns the forecast's suggestion down.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes, never copy. */
import type { ChangeSetOp } from '@cp/domain';

import type { SwapsAnswer } from '../data/fixer-api';

export interface SwapChoice {
  readonly stableId: string;
  /** Local `HH:MM` before and after. */
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly withId: string | null;
  readonly source: 'weather' | 'check';
  readonly op: ChangeSetOp;
}

export function mergeSwaps(answer: SwapsAnswer, clock: (instant: string) => string): SwapChoice[] {
  const choices: SwapChoice[] = [];
  const taken = new Set<string>();
  for (const op of answer.weather?.ops ?? []) {
    const at = op.after?.starts_at;
    const was = op.before?.starts_at ?? answer.now.find((b) => b.stableId === op.target)?.startsAt;
    if (typeof at !== 'string' || typeof was !== 'string') continue;
    taken.add(op.target);
    choices.push({
      stableId: op.target,
      from: clock(was),
      to: clock(at),
      reason: at > was ? 'dry_after' : 'dry_before',
      withId: null,
      source: 'weather',
      op,
    });
  }
  for (const swap of answer.swaps) {
    const op = answer.ops.find((entry) => entry.target === swap.stableId);
    if (op === undefined || taken.has(swap.stableId)) continue;
    if (swap.withId !== null && taken.has(swap.withId)) continue;
    choices.push({ ...swap, source: 'check', op });
  }
  return choices;
}

/** The blocks that tick with `stableId`: itself and the block it trades places with. */
export function partnersOf(choices: readonly SwapChoice[], stableId: string): string[] {
  const choice = choices.find((entry) => entry.stableId === stableId);
  if (choice === undefined) return [];
  const partner = choices.find(
    (entry) => entry.stableId === choice.withId || entry.withId === stableId,
  );
  return partner === undefined ? [stableId] : [stableId, partner.stableId];
}

export function toggled(
  choices: readonly SwapChoice[],
  unticked: ReadonlySet<string>,
  stableId: string,
): ReadonlySet<string> {
  const group = partnersOf(choices, stableId);
  const next = new Set(unticked);
  const on = unticked.has(stableId);
  for (const id of group) {
    if (on) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function tickedOps(
  choices: readonly SwapChoice[],
  unticked: ReadonlySet<string>,
): ChangeSetOp[] {
  return choices.filter((choice) => !unticked.has(choice.stableId)).map((choice) => choice.op);
}

/** True when the forecast's suggestion is on screen and every one of its swaps is unticked. */
export function weatherTurnedDown(
  choices: readonly SwapChoice[],
  unticked: ReadonlySet<string>,
): boolean {
  const weather = choices.filter((choice) => choice.source === 'weather');
  return weather.length > 0 && weather.every((choice) => unticked.has(choice.stableId));
}
