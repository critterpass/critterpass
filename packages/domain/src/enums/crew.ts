/**
 * Crew membership enums (docs/data-model.md §3.2). `CrewMemberRole` is shared with
 * `trip_participants.role`, which is why it lives here rather than under a table-specific module.
 */
import { z } from 'zod';

export const CREW_MEMBER_ROLES = ['organiser', 'member'] as const;
export const crewMemberRoleSchema = z.enum(CREW_MEMBER_ROLES);
export type CrewMemberRole = z.infer<typeof crewMemberRoleSchema>;

export const CREW_MEMBER_STATUSES = ['active', 'left', 'removed', 'former'] as const;
export const crewMemberStatusSchema = z.enum(CREW_MEMBER_STATUSES);
export type CrewMemberStatus = z.infer<typeof crewMemberStatusSchema>;
