/**
 * Wire schemas for the crew commands (docs/api-contracts.md §4.2): create, rename, switch, leave,
 * remove, notification level and join-code rotation.
 */
import { z } from 'zod';

import { crewCoverSchema } from './covers';
import { crewNameSchema, crewNotifyLevelSchema, type CrewNotifyLevel } from './limits';

/** A crew art key from the content catalogue (lowercase slug). */
export const crewArtSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);

export const createCrewPayloadSchema = z.object({
  /** Client-generated UUIDv7 so an offline create and its replay land on one crew. */
  crew_id: z.uuid(),
  name: crewNameSchema,
  art: crewArtSchema.optional(),
  cover: crewCoverSchema.optional(),
});
export type CreateCrewPayload = z.infer<typeof createCrewPayloadSchema>;

export interface CreateCrewResult {
  readonly crew_id: string;
  readonly code: string;
  readonly code_expires_at: string;
}

export const updateCrewPayloadSchema = z
  .object({
    crew_id: z.uuid(),
    name: crewNameSchema.optional(),
    art: crewArtSchema.nullable().optional(),
    cover: crewCoverSchema.nullable().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.art !== undefined || value.cover !== undefined,
    {
      message: 'nothing to update',
    },
  );
export type UpdateCrewPayload = z.infer<typeof updateCrewPayloadSchema>;

export const crewIdPayloadSchema = z.object({ crew_id: z.uuid() });
export type CrewIdPayload = z.infer<typeof crewIdPayloadSchema>;

export const leaveCrewPayloadSchema = z.object({
  crew_id: z.uuid(),
  /** Keep reading the crew chat history as a former member. */
  keep_in_chat: z.boolean().default(false),
});
export type LeaveCrewPayload = z.infer<typeof leaveCrewPayloadSchema>;

/**
 * Hands the crew's organiser role to another active member. With `leave` the caller then leaves
 * the crew (as `leave_crew` does, chat kept or not); without it they stay on as a member.
 */
export const transferOrganiserPayloadSchema = z.object({
  crew_id: z.uuid(),
  to_uid: z.uuid(),
  leave: z.boolean().default(false),
  keep_in_chat: z.boolean().default(false),
});
export type TransferOrganiserPayload = z.infer<typeof transferOrganiserPayloadSchema>;

export interface TransferOrganiserResult extends MembershipChangeResult {
  readonly organiser: string;
  readonly left: boolean;
}

/** Someone holding a code that ran out asks the person who shared it for a fresh invite. */
export const requestFreshInvitePayloadSchema = z.object({ code: z.string().min(1).max(16) });
export type RequestFreshInvitePayload = z.infer<typeof requestFreshInvitePayloadSchema>;

export interface RequestFreshInviteResult {
  /** False when this caller already asked about this code in the last day (nothing sent again). */
  readonly sent: boolean;
}

export const removeMemberPayloadSchema = z.object({ crew_id: z.uuid(), uid: z.uuid() });
export type RemoveMemberPayload = z.infer<typeof removeMemberPayloadSchema>;

export const setCrewNotifyPayloadSchema = z.object({
  crew_id: z.uuid(),
  level: crewNotifyLevelSchema,
});
export type SetCrewNotifyPayload = z.infer<typeof setCrewNotifyPayloadSchema>;

export interface SetCrewNotifyResult {
  readonly crew_id: string;
  readonly level: CrewNotifyLevel;
}

export interface MembershipChangeResult {
  readonly crew_id: string;
  /** Trips whose organiser role moved on because the leaver held it alone. */
  readonly handed_off: readonly { readonly scope: 'trip' | 'crew'; readonly id: string }[];
  /** Trips where a real seat was freed (a waitlist offer follows). */
  readonly freed_trips: readonly string[];
}

export interface RotateJoinCodeResult {
  readonly crew_id: string;
  readonly code: string;
  readonly expires_at: string;
}
