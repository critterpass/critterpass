/**
 * Who pays for what: flights are priced per member's origin (home airport, or an invitee's origin
 * once known); a member without one is priced from the crew's majority origin and flagged
 * `estimatedOrigin` so the UI can say so instead of guessing silently.
 */
import { type CostComponent } from '../quotes/quote-set';

export interface CostMember {
  readonly uid: string;
  /** IATA code of the airport this member flies from; `null` = not known yet. */
  readonly origin: string | null;
}

export interface ResolvedMember {
  readonly uid: string;
  readonly origin: string | null;
  readonly estimatedOrigin: boolean;
}

/** The most common known origin; ties go to the alphabetically first code. `null` if none known. */
export function majorityOrigin(members: readonly CostMember[]): string | null {
  const counts = new Map<string, number>();
  for (const member of members) {
    if (member.origin !== null) counts.set(member.origin, (counts.get(member.origin) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [origin, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (count > bestCount) {
      best = origin;
      bestCount = count;
    }
  }
  return best;
}

/** Fills unknown origins from the majority origin, flagging each one it filled. */
export function resolveOrigins(members: readonly CostMember[]): readonly ResolvedMember[] {
  const fallback = majorityOrigin(members);
  return members.map((member) =>
    member.origin !== null
      ? { uid: member.uid, origin: member.origin, estimatedOrigin: false }
      : { uid: member.uid, origin: fallback, estimatedOrigin: fallback !== null },
  );
}

/** Members (by uid order) the component applies to. */
export function applicableMembers(
  component: CostComponent,
  members: readonly ResolvedMember[],
): readonly ResolvedMember[] {
  const restricted = component.memberIds ? new Set(component.memberIds) : null;
  return members.filter((member) => {
    if (restricted && !restricted.has(member.uid)) return false;
    if (component.origin !== undefined && member.origin !== component.origin) return false;
    return true;
  });
}
