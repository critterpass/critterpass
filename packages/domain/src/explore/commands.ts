/**
 * Explore command payloads (docs/api-contracts.md §4.3, §4.6, docs/api-contracts-explore.md):
 * group swiping, saved lists and sponsored impressions/clicks. `save_place`/`unsave_place` keep
 * their payload in ../polls/commands.ts (a destination or a place, with an optional list).
 */
import { z } from 'zod';

export const SWIPE_VERDICTS = ['yes', 'no', 'super'] as const;
export const swipeVerdictSchema = z.enum(SWIPE_VERDICTS);
export type SwipeVerdict = z.infer<typeof swipeVerdictSchema>;

export const startSwipeSessionPayloadSchema = z.strictObject({
  session_id: z.uuid().optional(),
  trip_id: z.uuid(),
});
export type StartSwipeSessionPayload = z.infer<typeof startSwipeSessionPayloadSchema>;

export const swipeVotePayloadSchema = z.strictObject({
  session_id: z.uuid(),
  place_id: z.uuid(),
  verdict: swipeVerdictSchema,
});
export type SwipeVotePayload = z.infer<typeof swipeVotePayloadSchema>;

export const undoSwipePayloadSchema = z.strictObject({
  session_id: z.uuid(),
  place_id: z.uuid(),
});

export const endSwipeSessionPayloadSchema = z.strictObject({ session_id: z.uuid() });

export interface SwipeVoteResult {
  readonly session_id: string;
  readonly place_id: string;
  readonly verdict: SwipeVerdict;
  /** Set when this vote (or an earlier one) made the card a match. */
  readonly match: {
    readonly match_id: string;
    readonly change_set_id: string | null;
    readonly day_no: number | null;
    /**
     * `applied` never happens here: a match waits for the organiser as a suggestion. With the
     * planning redesign on, a new match goes to the trip's Ideas instead (`idea`).
     */
    readonly status: 'suggested' | 'unslotted' | 'idea';
    /** The trip idea the match went to; only present with the planning redesign on. */
    readonly idea_id?: string | null;
  } | null;
}

const listName = z.string().trim().min(1).max(60);

export const createSavedListPayloadSchema = z.strictObject({
  list_id: z.uuid().optional(),
  name: listName,
  position: z.number().int().min(0).max(1000).optional(),
});
export const renameSavedListPayloadSchema = z.strictObject({
  list_id: z.uuid(),
  name: listName,
  position: z.number().int().min(0).max(1000).optional(),
});
export const deleteSavedListPayloadSchema = z.strictObject({ list_id: z.uuid() });
export const moveSavedItemPayloadSchema = z.strictObject({
  item_id: z.uuid(),
  /** Null: back to the default "Saved" list. */
  list_name: listName.nullable(),
});

export const SPONSORED_LIST_KINDS = ['picks', 'map_carousel', 'search'] as const;
export const sponsoredListKindSchema = z.enum(SPONSORED_LIST_KINDS);
export type SponsoredListKind = z.infer<typeof sponsoredListKindSchema>;

export const recordSponsoredEventPayloadSchema = z.strictObject({
  placement_id: z.uuid(),
  list_kind: sponsoredListKindSchema,
  kind: z.enum(['impression', 'click']),
});
export type RecordSponsoredEventPayload = z.infer<typeof recordSponsoredEventPayloadSchema>;
