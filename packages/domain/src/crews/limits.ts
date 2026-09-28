/**
 * Crew limits: a crew holds at most 16 active members (never seat-capped; trips cap seats), a
 * user belongs to at most 10 active crews (a server-configurable ceiling, no paywall), and a crew
 * name is 1–32 characters after trimming.
 */
import { z } from 'zod';

export const CREW_NAME_MAX = 32;
export const CREW_MEMBER_CEILING = 16;
export const MAX_ACTIVE_CREWS_PER_USER = 10;

export const CREW_NOTIFY_LEVELS = ['all', 'mentions', 'off'] as const;
export const crewNotifyLevelSchema = z.enum(CREW_NOTIFY_LEVELS);
export type CrewNotifyLevel = z.infer<typeof crewNotifyLevelSchema>;
/** A member who never chose reads as `mentions`. */
export const DEFAULT_CREW_NOTIFY_LEVEL: CrewNotifyLevel = 'mentions';

/** Collapses inner whitespace and trims, so "  Bali   crew " and "Bali crew" are one name. */
export function normaliseCrewName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export const crewNameSchema = z
  .string()
  .transform(normaliseCrewName)
  .pipe(z.string().min(1).max(CREW_NAME_MAX));

export interface CrewJoinInput {
  readonly alreadyMember: boolean;
  readonly activeMembers: number;
  readonly memberCeiling: number;
  /** Active crews the joiner already belongs to. */
  readonly joinerActiveCrews: number;
  readonly maxActiveCrews: number;
}

export type CrewJoinDecision =
  | { readonly kind: 'join' }
  | { readonly kind: 'already_member' }
  | { readonly kind: 'crew_full'; readonly ceiling: number }
  | { readonly kind: 'crew_limit'; readonly limit: number };

/** Whether someone may join a crew right now. Membership is never blocked by a trip's seat cap. */
export function decideCrewJoin(input: CrewJoinInput): CrewJoinDecision {
  if (input.alreadyMember) return { kind: 'already_member' };
  if (input.activeMembers >= input.memberCeiling) {
    return { kind: 'crew_full', ceiling: input.memberCeiling };
  }
  if (input.joinerActiveCrews >= input.maxActiveCrews) {
    return { kind: 'crew_limit', limit: input.maxActiveCrews };
  }
  return { kind: 'join' };
}

/** Whether a user may start another crew. */
export function canStartCrew(activeCrews: number, maxActiveCrews: number): boolean {
  return activeCrews < maxActiveCrews;
}
