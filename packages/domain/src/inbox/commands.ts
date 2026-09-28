/**
 * Wire schemas for the inbox commands (docs/api-contracts.md §4.3). `act_inbox_item` runs the
 * action's own command under the same op_id, so a replay from any surface is one duplicate.
 */
import { z } from 'zod';

export const INBOX_ACTION_ID = /^[a-z][a-z0-9_]{0,39}$/;

export const actInboxItemPayloadSchema = z.object({
  item_id: z.uuid(),
  action: z.string().regex(INBOX_ACTION_ID),
});
export type ActInboxItemPayload = z.infer<typeof actInboxItemPayloadSchema>;

export interface ActInboxItemResult {
  readonly item_id: string;
  readonly action: string;
  readonly outcome: 'resolved' | 'already_resolved';
  /** The dispatched command's own result, when the action runs one. */
  readonly result?: unknown;
}

export const MARK_INBOX_READ_MAX = 200;

export const markInboxReadPayloadSchema = z.union([
  z.object({ item_ids: z.array(z.uuid()).min(1).max(MARK_INBOX_READ_MAX) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type MarkInboxReadPayload = z.infer<typeof markInboxReadPayloadSchema>;

export interface MarkInboxReadResult {
  readonly count: number;
}

/** One inline action as stored in `inbox_items.actions`. */
export const inboxActionSchema = z.object({
  id: z.string().regex(INBOX_ACTION_ID),
  style: z.enum(['primary', 'secondary', 'undo']),
  /** The command it runs; absent for an action that only settles the item (and opens its link). */
  command: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type InboxAction = z.infer<typeof inboxActionSchema>;

/** `badge.counts` on `user:#uid`: the bell and app icon show `needs_you`. */
export interface BadgeCounts {
  readonly needs_you: number;
  readonly unread: number;
}

export const INBOX_FANOUT_QUEUE = 'inbox.fanout';
export const inboxFanoutJobSchema = z.object({ event_id: z.uuid() });
export type InboxFanoutJob = z.infer<typeof inboxFanoutJobSchema>;
