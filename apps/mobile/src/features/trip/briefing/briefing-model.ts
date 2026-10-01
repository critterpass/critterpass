/**
 * The morning briefing card's state (3k-1): today's briefing and its lines, with my chip taps
 * still in the upload queue already applied, or why there is none (still being written, nothing
 * today, failed, or yesterday's while offline).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and command names, never copy. */
import { ACTED_STATUS, type BriefingAction, type BriefingItemStatus } from '@cp/domain';

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

export type BriefingState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'generating' }
  | { readonly kind: 'empty' }
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
  readonly briefing: BriefingRow | null;
  readonly items: readonly BriefingItemRow[];
  readonly pending: readonly PendingAct[];
  readonly today: string;
  readonly offline: boolean;
  /** The trip is within the briefing window (a month before, during). */
  readonly inWindow: boolean;
}): BriefingState {
  const { briefing } = input;
  const fresh = briefing !== null && briefing.local_date === input.today;
  if (briefing === null || (!fresh && !input.offline)) {
    return input.inWindow ? { kind: 'generating' } : { kind: 'hidden' };
  }
  if (briefing.status === 'failed') return { kind: 'failed' };
  const pending = new Map<string, BriefingAction>();
  for (const act of input.pending) {
    if (act.item_id !== null && act.action !== null && ACTIONS.includes(act.action)) {
      pending.set(act.item_id, act.action as BriefingAction);
    }
  }
  const lines = input.items.map((row) => lineOf(row, pending));
  if (briefing.status === 'empty' || lines.length === 0) return { kind: 'empty' };
  return { kind: 'ready', lines, staleDate: fresh ? null : briefing.local_date };
}
