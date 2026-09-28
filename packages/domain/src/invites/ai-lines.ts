/**
 * Wire shapes of the two guide lines around an invite (docs/api-contracts.md §5.3): the taste tags
 * and line the trip's guide suggests from the inviter's note, and the welcome line the crew's
 * manifest types out when someone joins. `source` says whether the guide wrote it or the template
 * fallback did (the model was switched off, unavailable or answered out of bounds).
 */
import { z } from 'zod';

import { tasteTagSchema } from '../taste/taxonomy';

import { INVITE_NAME_MAX, INVITE_NOTE_MAX } from './wire';

export const INVITE_TAGS_SUGGESTED_MAX = 3;
export const INVITE_TAGS_LINE_MAX = 70;
export const CREW_WELCOME_LINE_MAX = 90;

export const AI_LINE_SOURCES = ['model', 'template'] as const;
export const aiLineSourceSchema = z.enum(AI_LINE_SOURCES);

export const inviteTagsRequestSchema = z.object({
  crew_id: z.uuid(),
  trip_id: z.uuid().optional(),
  note: z.string().trim().min(1).max(INVITE_NOTE_MAX),
  invitee_name: z.string().trim().min(1).max(INVITE_NAME_MAX),
});
export type InviteTagsRequest = z.infer<typeof inviteTagsRequestSchema>;

export const inviteTagsResponseSchema = z.object({
  tags: z.array(tasteTagSchema).max(INVITE_TAGS_SUGGESTED_MAX),
  line: z.string().max(INVITE_TAGS_LINE_MAX),
  /** The guide whose voice the line is in (the trip's guide, else Tokek). */
  guide: z.string().min(1).max(32),
  source: aiLineSourceSchema,
});
export type InviteTagsResponse = z.infer<typeof inviteTagsResponseSchema>;

export const crewWelcomeResponseSchema = z.object({
  line: z.string().max(CREW_WELCOME_LINE_MAX),
  source: aiLineSourceSchema,
});
export type CrewWelcomeResponse = z.infer<typeof crewWelcomeResponseSchema>;
