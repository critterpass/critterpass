/**
 * Planning command payloads and results (docs/api-contracts-planning.md, commands). Errors reuse
 * the shared codes (docs/api-contracts.md §3) with a `reason` in `detail`: `VALIDATION`,
 * `STATE_INVALID`, `FORBIDDEN` and `NOT_FOUND`; no command here adds a code.
 */
import { z } from 'zod';

import { customPlaceSchema, ideaSourceSchema } from './ideas';
import { placeStanceSchema, stanceNoteSchema } from './stances';

export const saveIdeaPayloadSchema = z
  .strictObject({
    /** Client-chosen id, so the optimistic row and the synced row are one idea. */
    idea_id: z.uuid().optional(),
    trip_id: z.uuid(),
    poi_id: z.uuid().optional(),
    pin: customPlaceSchema.optional(),
    source: ideaSourceSchema,
    source_url: z.url().max(2048).optional(),
  })
  .refine((payload) => (payload.poi_id === undefined) !== (payload.pin === undefined), {
    message: 'exactly one of poi_id or pin',
  });
export type SaveIdeaPayload = z.infer<typeof saveIdeaPayloadSchema>;
export const saveIdeaResultSchema = z.object({
  idea_id: z.uuid(),
  backer_ids: z.array(z.uuid()),
});
export type SaveIdeaResult = z.infer<typeof saveIdeaResultSchema>;

export const removeIdeaPayloadSchema = z.strictObject({ idea_id: z.uuid() });
export const removeIdeaResultSchema = z.object({
  idea_id: z.uuid(),
  /** True when the idea itself went (last backer, or an organiser removed it). */
  removed: z.boolean(),
  backer_ids: z.array(z.uuid()),
});
export type RemoveIdeaResult = z.infer<typeof removeIdeaResultSchema>;

export const hidePlacePayloadSchema = z.strictObject({ poi_id: z.uuid() });
export const unhidePlacePayloadSchema = z.strictObject({ poi_id: z.uuid() });
export const hidePlaceResultSchema = z.object({ poi_id: z.uuid(), hidden: z.boolean() });
export type HidePlaceResult = z.infer<typeof hidePlaceResultSchema>;

export const setPlaceStancePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  poi_id: z.uuid(),
  stance: placeStanceSchema,
  note: stanceNoteSchema.optional(),
});
export const clearPlaceStancePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  poi_id: z.uuid(),
});
export const placeStanceResultSchema = z.object({
  poi_id: z.uuid(),
  stance: placeStanceSchema.nullable(),
});
export type PlaceStanceResult = z.infer<typeof placeStanceResultSchema>;

export const startIdeaPlacementPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** Absent: every idea not yet on a day. */
  idea_ids: z.array(z.uuid()).min(1).max(30).optional(),
});
export const startIdeaPlacementResultSchema = z.object({ job_id: z.uuid() });
export type StartIdeaPlacementResult = z.infer<typeof startIdeaPlacementResultSchema>;

export const PLACE_DECISION_MODES = ['suggest', 'vote'] as const;
export const postPlaceDecisionPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  poi_id: z.uuid(),
  option_ids: z.array(z.string().min(1).max(64)).min(1).max(2),
  mode: z.enum(PLACE_DECISION_MODES),
});
export const postPlaceDecisionResultSchema = z.object({ poll_id: z.uuid() });
export type PostPlaceDecisionResult = z.infer<typeof postPlaceDecisionResultSchema>;

export const applyCheckFixPayloadSchema = z.strictObject({
  issue_id: z.uuid(),
  /** The plan version the person saw the issue on. */
  base_version: z.uuid(),
});
/** An organiser's fix applies at once with an undo; a member's goes to the crew as a change set. */
export const applyCheckFixResultSchema = z.discriminatedUnion('applied', [
  z.object({ applied: z.literal(true), guide_action_id: z.uuid() }),
  z.object({ applied: z.literal(false), change_set_id: z.uuid() }),
]);
export type ApplyCheckFixResult = z.infer<typeof applyCheckFixResultSchema>;

export const MEMBER_ASK_MAX_IDEAS = 3;
export const askMemberAboutSavesPayloadSchema = z.strictObject({
  ask_id: z.uuid().optional(),
  trip_id: z.uuid(),
  user_id: z.uuid(),
  idea_ids: z.array(z.uuid()).min(1).max(MEMBER_ASK_MAX_IDEAS),
});
export const askMemberAboutSavesResultSchema = z.object({ ask_id: z.uuid() });
export type AskMemberAboutSavesResult = z.infer<typeof askMemberAboutSavesResultSchema>;

export const answerMemberAskPayloadSchema = z.strictObject({
  ask_id: z.uuid(),
  accept: z.boolean(),
});
export const answerMemberAskResultSchema = z.object({
  ask_id: z.uuid(),
  status: z.enum(['accepted', 'declined']),
  /** Set when an accepted ask went to the crew as a change set (the asker is no longer organiser). */
  change_set_id: z.uuid().nullable(),
});
export type AnswerMemberAskResult = z.infer<typeof answerMemberAskResultSchema>;

/** `detail.reason` values the planning commands answer with, by error code. */
export const PLANNING_ERROR_REASONS = {
  VALIDATION: ['outside_destination', 'pin_or_poi', 'too_many_ideas'],
  STATE_INVALID: [
    'stale_issue',
    'no_fix',
    'placement_running',
    'ask_closed',
    'trip_closed',
    'no_current_plan',
  ],
  FORBIDDEN: ['not_participant', 'not_organiser', 'not_asked_member', 'not_backer'],
  NOT_FOUND: ['idea', 'issue', 'ask', 'place'],
} as const;

/** Every planning command's payload and result schema. */
export const PLANNING_COMMANDS = {
  save_idea: { payload: saveIdeaPayloadSchema, result: saveIdeaResultSchema },
  remove_idea: { payload: removeIdeaPayloadSchema, result: removeIdeaResultSchema },
  hide_place: { payload: hidePlacePayloadSchema, result: hidePlaceResultSchema },
  unhide_place: { payload: unhidePlacePayloadSchema, result: hidePlaceResultSchema },
  set_place_stance: { payload: setPlaceStancePayloadSchema, result: placeStanceResultSchema },
  clear_place_stance: { payload: clearPlaceStancePayloadSchema, result: placeStanceResultSchema },
  start_idea_placement: {
    payload: startIdeaPlacementPayloadSchema,
    result: startIdeaPlacementResultSchema,
  },
  post_place_decision: {
    payload: postPlaceDecisionPayloadSchema,
    result: postPlaceDecisionResultSchema,
  },
  apply_check_fix: { payload: applyCheckFixPayloadSchema, result: applyCheckFixResultSchema },
  ask_member_about_saves: {
    payload: askMemberAboutSavesPayloadSchema,
    result: askMemberAboutSavesResultSchema,
  },
  answer_member_ask: { payload: answerMemberAskPayloadSchema, result: answerMemberAskResultSchema },
} as const satisfies Record<string, { payload: z.ZodType; result: z.ZodType }>;
export type PlanningCommandName = keyof typeof PLANNING_COMMANDS;
