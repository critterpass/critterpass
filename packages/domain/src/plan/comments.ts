/**
 * Anchored plan comments and their +1s (docs/data-model.md §3.3 `comments`, `comment_plus_ones`;
 * docs/api-contracts.md §4.2). A comment hangs off a plan item (its `stable_id`, so it survives new
 * versions), a poll option, a day number or a place inside a decision option. Deleting leaves a
 * tombstone (body cleared) so a thread keeps its shape on every device.
 */
import { z } from 'zod';

export const COMMENT_ANCHOR_KINDS = ['item', 'option', 'day', 'poi_in_option'] as const;
export const commentAnchorKindSchema = z.enum(COMMENT_ANCHOR_KINDS);
export type CommentAnchorKind = z.infer<typeof commentAnchorKindSchema>;

export const COMMENT_BODY_MAX = 1000;

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ANCHOR_ID_PATTERNS: Readonly<Record<CommentAnchorKind, RegExp>> = {
  item: new RegExp(`^${uuidPattern}$`),
  option: new RegExp(`^${uuidPattern}$`),
  day: /^[1-9][0-9]{0,2}$/,
  poi_in_option: new RegExp(`^${uuidPattern}:${uuidPattern}$`),
};

/** Whether `id` is a well-formed anchor of `kind` (`day` = day number, `poi_in_option` = option:poi). */
export function isCommentAnchorId(kind: CommentAnchorKind, id: string): boolean {
  return ANCHOR_ID_PATTERNS[kind].test(id);
}

export const commentTargetSchema = z
  .object({ kind: commentAnchorKindSchema, id: z.string().min(1).max(80) })
  .refine((target) => isCommentAnchorId(target.kind, target.id), {
    message: 'anchor id does not match its kind',
    path: ['id'],
  });
export type CommentTarget = z.infer<typeof commentTargetSchema>;

const body = z.string().trim().min(1).max(COMMENT_BODY_MAX);

export const addCommentPayloadSchema = z.object({
  /** Client-chosen id, so the optimistic row and the synced one are the same comment. */
  comment_id: z.uuid().optional(),
  trip_id: z.uuid(),
  target: commentTargetSchema,
  body,
});
export type AddCommentPayload = z.infer<typeof addCommentPayloadSchema>;

export const editCommentPayloadSchema = z.object({ comment_id: z.uuid(), body });
export const commentIdPayloadSchema = z.object({ comment_id: z.uuid() });
