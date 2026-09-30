/**
 * The morning briefing (one per member, trip and local date): a deterministic candidate list the
 * model may only word, never extend. Each candidate carries the facts its line may cite (the only
 * numbers allowed), who it concerns and the action its chip performs.
 */
import { z } from 'zod';

export const BRIEFING_ACTIONS = ['done', 'nudge', 'set', 'open'] as const;
export const briefingActionSchema = z.enum(BRIEFING_ACTIONS);
export type BriefingAction = z.infer<typeof briefingActionSchema>;

export const BRIEFING_ITEM_STATUSES = ['open', 'done', 'nudged', 'set', 'opened'] as const;
export type BriefingItemStatus = (typeof BRIEFING_ITEM_STATUSES)[number];

/** The status an acted item moves to. */
export const ACTED_STATUS: Readonly<Record<BriefingAction, BriefingItemStatus>> = {
  done: 'done',
  nudge: 'nudged',
  set: 'set',
  open: 'opened',
};

export const BRIEFING_ICONS = [
  'ticket',
  'plane',
  'wallet',
  'alarm',
  'key',
  'vote',
  'chat',
  'sun',
  'bag',
] as const;
export const briefingIconSchema = z.enum(BRIEFING_ICONS);
export type BriefingIcon = z.infer<typeof briefingIconSchema>;

export const BRIEFING_CANDIDATE_KINDS = [
  'first_item',
  'leave_by',
  'free_cancel',
  'flight',
  'balance',
  'not_up',
  'host_info',
  'queued_answer',
  'open_vote',
] as const;
export type BriefingCandidateKind = (typeof BRIEFING_CANDIDATE_KINDS)[number];

export const MAX_BRIEFING_ITEMS = 3;
export const BRIEFING_TEXT_MAX = 140;

export const briefingCandidateSchema = z.object({
  /** Stable within one run (`c1`, `c2`, …); the model answers with these ids only. */
  id: z.string().regex(/^c\d{1,2}$/u),
  kind: z.enum(BRIEFING_CANDIDATE_KINDS),
  action: briefingActionSchema,
  icon: briefingIconSchema,
  /** Higher first when the template picks. */
  priority: z.number().int().min(0).max(100),
  /** The only values (names, times, amounts, counts) the worded line may carry. */
  facts: z.record(z.string(), z.union([z.string(), z.number()])),
  /** The deterministic line, used when the model fails or answers out of bounds. */
  template: z.string().min(1).max(BRIEFING_TEXT_MAX),
  target_user_ids: z.array(z.uuid()).max(16),
  deep_link: z.string().max(300).nullable(),
  dedupe_key: z.string().min(1).max(200),
});
export type BriefingCandidate = z.infer<typeof briefingCandidateSchema>;

/** What the model returns: candidates it chose, each worded once. */
export const briefingReplySchema = z.object({
  items: z
    .array(
      z.object({
        candidate_id: z.string(),
        text: z.string(),
        icon: z.string().optional(),
      }),
    )
    .max(10),
});
export type BriefingReply = z.infer<typeof briefingReplySchema>;

/** One stored line. */
export interface BriefingLine {
  readonly candidate: BriefingCandidate;
  readonly text: string;
  readonly icon: BriefingIcon;
}

export const actBriefingItemPayloadSchema = z.object({
  item_id: z.uuid(),
  action: briefingActionSchema,
});
export type ActBriefingItemPayload = z.infer<typeof actBriefingItemPayloadSchema>;

/** An item another domain pushes into today's briefing (a moved flight, a moved pickup). */
export const briefingEventItemSchema = z.object({
  trip_id: z.uuid(),
  user_ids: z.array(z.uuid()).min(1).max(32),
  source_event_id: z.uuid(),
  icon: briefingIconSchema,
  text: z.string().min(1).max(BRIEFING_TEXT_MAX),
  action: briefingActionSchema,
  deep_link: z.string().max(300).nullable(),
});
export type BriefingEventItem = z.infer<typeof briefingEventItemSchema>;

/** The briefing's local time: 07:00, or an hour before the day's first item, never before 05:00. */
export function briefingLocalTime(firstItemLocal: string | null): string {
  if (firstItemLocal === null) return '07:00';
  const [hours = 0, minutes = 0] = firstItemLocal.split(':').map(Number);
  const at = Math.max(5 * 60, Math.min(7 * 60, hours * 60 + minutes - 60));
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
}
