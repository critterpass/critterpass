/** A change set's ops as the review holds them: each with its row's tick (unticked rows don't count). */
import { changeSetOpsSchema, type ChangeSetOp } from '@cp/domain';

export function opsOf(raw: string | null, accepted: ReadonlyMap<string, boolean>): ChangeSetOp[] {
  try {
    const parsed = changeSetOpsSchema.safeParse(raw === null ? [] : JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.map((op) => ({ ...op, accepted: accepted.get(op.target) ?? true }));
  } catch {
    return [];
  }
}
