/**
 * A stop moved to (or re-timed on) a day that has already begun, at a time already gone: it is
 * never put there as if she had been. The sheet says the time has passed and offers the first
 * start after now that the rest of the day leaves free ("09:30 has passed · Start at 16:00
 * instead"), and SAVE waits for it.
 */
import { t } from '@lingui/core/macro';

import type { DayItem } from '@/data/plan/plan-model';
import type { DaySlot } from '@/data/plan/plan-ops';

import { retime, type Travel } from '../day-plan/reschedule';
import { clock } from './format';
import type { ChangePreview } from './item-detail-sheet';

const QUARTER = 15;
/** More stops than a day holds: how far the next free start is looked for. */
const MAX_TRIES = 12;

/** The first start at or after `from` the day leaves free for `stop`; null past midnight. */
export function firstFreeFrom(
  stops: readonly DayItem[],
  stop: DayItem,
  length: number,
  from: number,
  slot: DaySlot,
  travel: Travel,
): number | null {
  let start = Math.ceil(from / QUARTER) * QUARTER;
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const result = retime(
      stops,
      { stableId: stop.stableId, start, end: start + length },
      slot,
      travel,
    );
    if (result.ok) return start;
    if (result.refusal.kind !== 'starts_too_early') return null;
    start = result.refusal.earliest;
  }
  return null;
}

/** The preview for a start already gone on a begun day; null when the start is still to come. */
export function pastTimePreview(input: {
  readonly stops: readonly DayItem[];
  readonly stop: DayItem;
  readonly start: number;
  readonly end: number;
  readonly nowMin: number | null;
  readonly slot: DaySlot;
  readonly travel: Travel;
  readonly locale: string;
}): ChangePreview | null {
  const { nowMin, start, locale } = input;
  if (nowMin === null || start >= nowMin) return null;
  const at = clock(locale, start);
  const next = firstFreeFrom(
    input.stops,
    input.stop,
    input.end - start,
    nowMin,
    input.slot,
    input.travel,
  );
  return {
    blocked: true,
    ...(next === null ? {} : { useStart: next }),
    line:
      next === null
        ? t({
            id: 'plan.retime.pastNoRoom',
            message: `${at} has passed, and the rest of the day is full.`,
          })
        : t({ id: 'plan.retime.past', message: `${at} has passed.` }),
  };
}
