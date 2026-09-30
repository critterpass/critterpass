/**
 * Who is up for a leave-by: the "4 OF 6 ARE UP" count, the members the alarm still rings for
 * ("Tokek rings Alex and Dev at 03:00") and the `readiness` envelope on `trip_dayof:`.
 */
import { isAwake, type ReadinessEnvelope, type ReadinessState } from '@cp/domain';

export interface MemberReadiness {
  readonly userId: string;
  readonly state: ReadinessState;
}

export interface ReadinessSummary {
  readonly up: readonly string[];
  readonly notUp: readonly string[];
  readonly total: number;
  readonly allUp: boolean;
}

export function summarizeReadiness(members: readonly MemberReadiness[]): ReadinessSummary {
  const up = members.filter((member) => isAwake(member.state)).map((member) => member.userId);
  const notUp = members.filter((member) => !isAwake(member.state)).map((member) => member.userId);
  return { up, notUp, total: members.length, allUp: members.length > 0 && notUp.length === 0 };
}

export function readinessEnvelope(
  leaveById: string,
  members: readonly MemberReadiness[],
): ReadinessEnvelope {
  const summary = summarizeReadiness(members);
  return { leave_by_id: leaveById, up: summary.up, total: summary.total };
}

/** "Alex", "Alex and Dev", "Alex, Dev and Rin". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}
