/**
 * Putting a day in an area and back at its stop. Both are sent online only: the server answers
 * with the stops it moved back to Ideas and may refuse (another time zone, a draft being written),
 * so a screen shows the action disabled with the offline line instead of queueing it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire reasons, never copy. */
import {
  dayAreaResultSchema,
  type ClearDayAreaPayload,
  type DayAreaResult,
  type SetDayAreaPayload,
} from '@cp/domain';

import type { SendResult } from '@/data/commands/client';
import { defineClientCommand } from '@/data/commands/summaries';

export const setDayAreaCommand = defineClientCommand<SetDayAreaPayload>({
  name: 'set_day_area',
  offline: false,
});

export const clearDayAreaCommand = defineClientCommand<ClearDayAreaPayload>({
  name: 'clear_day_area',
  offline: false,
});

export type DayAreaRefusal =
  | 'not_a_day_trip'
  | 'other_time_zone'
  | 'other_currency'
  | 'draft_running'
  | 'plan_changed'
  | 'offline'
  | 'other';

export type DayAreaOutcome =
  | { readonly ok: true; readonly result: DayAreaResult }
  | { readonly ok: false; readonly refusal: DayAreaRefusal };

const REASONS: readonly DayAreaRefusal[] = [
  'not_a_day_trip',
  'other_time_zone',
  'other_currency',
  'draft_running',
];

/** What the server said, as the screen words it: the result, or why it refused. */
export function dayAreaOutcome(sent: SendResult): DayAreaOutcome {
  if (sent.kind === 'applied') {
    const parsed = dayAreaResultSchema.safeParse(sent.result);
    return parsed.success ? { ok: true, result: parsed.data } : { ok: false, refusal: 'other' };
  }
  if (sent.kind === 'unavailable' || sent.kind === 'queued') {
    return { ok: false, refusal: 'offline' };
  }
  if (sent.code === 'PLAN_VERSION_CONFLICT') return { ok: false, refusal: 'plan_changed' };
  const reason = (sent.detail as { reason?: unknown } | null | undefined)?.reason;
  const known = REASONS.find((candidate) => candidate === reason);
  return { ok: false, refusal: known ?? 'other' };
}
