import type { CandidateRow } from '../data/queries';

/** Pending finds for the banner, and whose inbox most of them came from. */
export function bannerOf(
  candidates: readonly CandidateRow[],
  uid: string | null,
  names: ReadonlyMap<string, string>,
): { count: number; member: string | null } | null {
  const pending = candidates.filter((candidate) => candidate.status === 'pending');
  if (pending.length === 0) return null;
  const counts = new Map<string, number>();
  for (const candidate of pending) {
    if (candidate.user_id === uid) continue;
    counts.set(candidate.user_id, (counts.get(candidate.user_id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { count: pending.length, member: top === undefined ? null : (names.get(top[0]) ?? null) };
}
