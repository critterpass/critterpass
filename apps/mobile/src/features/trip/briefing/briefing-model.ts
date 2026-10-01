/**
 * The morning briefing card's state (3k-1): today's briefing and its lines, with my chip taps
 * still in the upload queue already applied, or why there is none (the first local read still
 * pending, nothing for me today, failed, or yesterday's while offline). "Nothing today" is a
 * settled state: a member with no briefing row for the day (the morning's run found nothing, they
 * joined after it, or the daily ones have not started) never waits on one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and command names, never copy. */
import {
  ACTED_STATUS,
  toLocalWallTime,
  type BriefingAction,
  type BriefingItemStatus,
} from '@cp/domain';

import { parseIdList } from '../leave-by/model';

export const ACT_BRIEFING_ITEM = 'act_briefing_item';

export const BRIEFING_SQL = `SELECT id, local_date, status, fallback_used, built_at FROM briefings
  WHERE trip_id = ? AND user_id = ? ORDER BY local_date DESC LIMIT 1`;
export const BRIEFING_ITEMS_SQL = `SELECT id, position, icon, text, action, target_user_ids,
    deep_link, status, source FROM briefing_items WHERE briefing_id = ? ORDER BY position, id`;
export const PENDING_ACTS_SQL = `SELECT json_extract(envelope, '$.payload.item_id') AS item_id,
    json_extract(envelope, '$.payload.action') AS action
  FROM commands WHERE cmd = '${ACT_BRIEFING_ITEM}' ORDER BY seq`;

export interface BriefingRow {
  readonly id: string;
  readonly local_date: string;
  readonly status: string;
  readonly fallback_used: number | null;
  readonly built_at: string | null;
}

export interface BriefingItemRow {
  readonly id: string;
  readonly position: number | null;
  readonly icon: string | null;
  readonly text: string;
  readonly action: string;
  readonly target_user_ids: string | null;
  readonly deep_link: string | null;
  readonly status: string;
  readonly source: string | null;
}

export interface PendingAct {
  readonly item_id: string | null;
  readonly action: string | null;
}

export interface BriefingLine {
  readonly id: string;
  readonly icon: string;
  readonly text: string;
  readonly action: BriefingAction;
  readonly status: BriefingItemStatus;
  readonly targets: readonly string[];
  readonly deepLink: string | null;
}

/**
 * When the guide next briefs: later this morning (today's has not been written yet), tomorrow, on
 * a date before the daily ones start, or never again.
 */
export type NextBriefing =
  | { readonly on: 'today' }
  | { readonly on: 'tomorrow' }
  | { readonly on: 'date'; readonly date: string }
  | null;

/** The briefing's own clock: the date and time ("07:15") where its mornings are counted. */
export interface BriefingClock {
  readonly date: string;
  readonly time: string;
}

/** The first local read of the briefing: not answered yet, answered, or it threw. */
export type BriefingRead = 'pending' | 'settled' | 'failed';

export type BriefingState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'none'; readonly next: NextBriefing }
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'ready';
      readonly lines: readonly BriefingLine[];
      /** Yesterday's (or older), shown because this phone is offline. */
      readonly staleDate: string | null;
    };

const ACTIONS: readonly string[] = ['done', 'nudge', 'set', 'open'];

function lineOf(row: BriefingItemRow, pending: ReadonlyMap<string, BriefingAction>): BriefingLine {
  const action = (ACTIONS.includes(row.action) ? row.action : 'open') as BriefingAction;
  const queued = pending.get(row.id);
  const status = queued === undefined ? (row.status as BriefingItemStatus) : ACTED_STATUS[queued];
  return {
    id: row.id,
    icon: row.icon ?? 'sun',
    text: row.text,
    action,
    status,
    targets: parseIdList(row.target_user_ids),
    deepLink: row.deep_link,
  };
}

export function briefingState(input: {
  readonly read: BriefingRead;
  readonly briefing: BriefingRow | null;
  readonly items: readonly BriefingItemRow[];
  readonly pending: readonly PendingAct[];
  /** Now on the briefing's clock ({@link briefingClock}). */
  readonly clock: BriefingClock;
  readonly offline: boolean;
  /** The trip has briefings at all right now (before it with dates, during it). */
  readonly briefed: boolean;
  readonly startDate: string | null;
  readonly endDate: string | null;
}): BriefingState {
  if (!input.briefed) return { kind: 'hidden' };
  if (input.read === 'failed') return { kind: 'failed' };
  if (input.read === 'pending') return { kind: 'loading' };
  const { briefing, clock } = input;
  const fresh = briefing !== null && briefing.local_date === clock.date;
  const next = (built: boolean) =>
    nextBriefing({ clock, startDate: input.startDate, endDate: input.endDate, built });
  // No row for me today: nothing has been written for me (yet). Offline, an older one still shows.
  if (briefing === null || (!fresh && !input.offline)) return { kind: 'none', next: next(false) };
  if (briefing.status === 'failed') return { kind: 'failed' };
  const pending = new Map<string, BriefingAction>();
  for (const act of input.pending) {
    if (act.item_id !== null && act.action !== null && ACTIONS.includes(act.action)) {
      pending.set(act.item_id, act.action as BriefingAction);
    }
  }
  const lines = input.items.map((row) => lineOf(row, pending));
  if (briefing.status === 'empty' || lines.length === 0) {
    // A row the morning's run has not filled in yet (an event made it early) is still to come.
    return { kind: 'none', next: next(fresh && briefing.built_at !== null) };
  }
  return { kind: 'ready', lines, staleDate: fresh ? null : briefing.local_date };
}

/** How many days before the trip's first day the morning briefings start (the worker's lead). */
export const BRIEFING_LEAD_DAYS = 30;
/**
 * The latest a morning's briefing is written (07:00, or earlier before an early first stop), with
 * a quarter of an hour for it to reach the phone. Until then today's may still be on its way.
 */
export const BRIEFING_MORNING_ENDS = '07:15';

const DAY_MS = 86_400_000;
const dayAt = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * Now where the briefing's mornings are counted: on the traveller's own clock before the trip, on
 * the trip's from its first day (the worker's rule).
 */
export function briefingClock(
  now: Date,
  input: { readonly startDate: string | null; readonly tripTz: string; readonly ownTz: string },
): BriefingClock {
  const own = toLocalWallTime(now, input.ownTz);
  const onTrip = input.startDate !== null && own.date >= input.startDate;
  const { date, time } = onTrip ? toLocalWallTime(now, input.tripTz) : own;
  return { date, time: time.slice(0, 5) };
}

/**
 * When the next morning briefing comes: the mornings run daily from {@link BRIEFING_LEAD_DAYS}
 * before the first day to the last day. With none `built` for today and the morning not over,
 * today's is still to come.
 */
export function nextBriefing(input: {
  readonly clock: BriefingClock;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly built: boolean;
}): NextBriefing {
  const { clock, startDate } = input;
  if (startDate === null) return null;
  const last = input.endDate ?? startDate;
  const opens = new Date(dayAt(startDate) - BRIEFING_LEAD_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (clock.date < opens) return { on: 'date', date: opens };
  if (clock.date > last) return null;
  if (!input.built && clock.time < BRIEFING_MORNING_ENDS) return { on: 'today' };
  return clock.date < last ? { on: 'tomorrow' } : null;
}
