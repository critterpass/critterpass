/**
 * Console contracts for the ideas board: the list support reviews (`GET /v1/admin/ideas`) and
 * `set_idea_status`, which publishes or declines a suggested idea and moves a published one along
 * (planned, building, shipped with its version). `merged` is set only by a merge, never here.
 */
import { z } from 'zod';

import { ideaStatusSchema, type IdeaStatus } from '../help/ideas';

const isoDate = z.iso.datetime({ offset: true });

/** Statuses an operator can set by hand. */
export const SETTABLE_IDEA_STATUSES = [
  'open',
  'planned',
  'building',
  'shipped',
  'declined',
] as const satisfies readonly IdeaStatus[];
export type SettableIdeaStatus = (typeof SETTABLE_IDEA_STATUSES)[number];

/**
 * Where an idea may go from its status: a suggestion is published (`open`) or declined; a published
 * idea moves between open, planned and building, ships or is declined; a declined one can be
 * reopened; shipped and merged are final.
 */
export function canMoveIdea(from: IdeaStatus, to: SettableIdeaStatus): boolean {
  if (from === to) return false;
  switch (from) {
    case 'pending_review':
      return to === 'open' || to === 'declined';
    case 'open':
    case 'planned':
    case 'building':
      return true;
    case 'declined':
      return to === 'open';
    case 'shipped':
    case 'merged':
      return false;
  }
}

export const setIdeaStatusPayloadSchema = z
  .strictObject({
    idea_id: z.uuid(),
    /** Omit to change only the team note. */
    status: z.enum(SETTABLE_IDEA_STATUSES).optional(),
    /** The team's reply shown on the board; null clears it. */
    team_note: z.string().trim().min(1).max(500).nullable().optional(),
    /** The app version a shipped idea landed in. */
    fixed_in_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, 'x.y.z')
      .optional(),
  })
  .refine((payload) => payload.status !== undefined || payload.team_note !== undefined, {
    message: 'status or team_note',
  })
  .refine((payload) => payload.status !== 'shipped' || payload.fixed_in_version !== undefined, {
    message: 'a shipped idea names its version',
    path: ['fixed_in_version'],
  });
export type SetIdeaStatusPayload = z.infer<typeof setIdeaStatusPayloadSchema>;

export const adminIdeaSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  locale: z.string(),
  status: ideaStatusSchema,
  team_note: z.string().nullable(),
  fixed_in_version: z.string().nullable(),
  votes_count: z.number().int(),
  author_id: z.uuid().nullable(),
  author_name: z.string().nullable(),
  created_at: isoDate,
  status_changed_at: isoDate,
});
export type AdminIdea = z.infer<typeof adminIdeaSchema>;

export const adminIdeasQuerySchema = z.object({
  status: ideaStatusSchema.default('pending_review'),
});
export const adminIdeasResponseSchema = z.object({
  items: z.array(adminIdeaSchema),
  /** Ideas per status, whatever status is listed. */
  counts: z.record(z.string(), z.number().int()),
});
