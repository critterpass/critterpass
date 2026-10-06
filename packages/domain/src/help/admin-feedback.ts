/**
 * Console contracts for feedback tickets: the list support works through (`GET /v1/admin/feedback`,
 * soonest reply due first, with what triage found), `set_feedback_status` and
 * `merge_feedback_into_idea`, which files a ticket under the idea it asks for and closes it.
 */
import { z } from 'zod';

import {
  FEEDBACK_STATUSES,
  feedbackCategorySchema,
  feedbackMoodSchema,
  feedbackSourceSchema,
} from './schemas';
import { feedbackAreaSchema, feedbackKindSchema, feedbackSeveritySchema } from './triage';

const isoDate = z.iso.datetime({ offset: true });
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

/** `in_tracker` is set by the forward alone: a ticket is there when its issue exists. */
export const SETTABLE_FEEDBACK_STATUSES = ['new', 'replied', 'closed'] as const;

export const setFeedbackStatusPayloadSchema = z.strictObject({
  ticket_id: z.uuid(),
  status: z.enum(SETTABLE_FEEDBACK_STATUSES),
});
export type SetFeedbackStatusPayload = z.infer<typeof setFeedbackStatusPayloadSchema>;

export const mergeFeedbackIntoIdeaPayloadSchema = z.strictObject({
  ticket_id: z.uuid(),
  idea_id: z.uuid(),
});
export type MergeFeedbackIntoIdeaPayload = z.infer<typeof mergeFeedbackIntoIdeaPayloadSchema>;

export const adminFeedbackTicketSchema = z.object({
  id: z.uuid(),
  ticket_no: z.number().int(),
  status: feedbackStatusSchema,
  mood: feedbackMoodSchema.nullable(),
  category: feedbackCategorySchema.nullable(),
  body: z.string(),
  source: feedbackSourceSchema,
  kind: feedbackKindSchema.nullable(),
  area: feedbackAreaSchema.nullable(),
  severity: feedbackSeveritySchema.nullable(),
  triage_summary: z.string().nullable(),
  duplicate_of_no: z.number().int().nullable(),
  duplicate_score: z.number().nullable(),
  tracker_issue_id: z.string().nullable(),
  fixed_in_version: z.string().nullable(),
  idea_id: z.uuid().nullable(),
  idea_title: z.string().nullable(),
  app_version: z.string(),
  reply_channel: z.enum(['email', 'inbox']),
  reply_due_at: isoDate,
  created_at: isoDate,
  user_id: z.uuid(),
  user_name: z.string().nullable(),
});
export type AdminFeedbackTicket = z.infer<typeof adminFeedbackTicketSchema>;

export const adminFeedbackQuerySchema = z.object({
  status: feedbackStatusSchema.default('new'),
});
export const adminFeedbackResponseSchema = z.object({
  items: z.array(adminFeedbackTicketSchema),
  /** Tickets per status, whatever status is listed. */
  counts: z.record(z.string(), z.number().int()),
});
