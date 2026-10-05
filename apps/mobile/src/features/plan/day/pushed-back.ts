/**
 * Taking a stop off its day when it once pushed later stops to make room: those stops go back to
 * exactly where they were, said before it is confirmed ("3 later stops move back to where they
 * were.") and taken back with the same UNDO. Without such a record (none was kept, or one of those
 * stops has moved since) the day falls back to the gap rule (./close-gap).
 */
import type { PlanOp, PlanPush, PlanState } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import { pushedBackOps } from '@/data/plan/plan-pushes';

export interface PushedBack {
  readonly ops: readonly PlanOp[];
  readonly line: string;
}

export function pushedBack(
  pushes: readonly PlanPush[],
  cause: string,
  state: PlanState,
): PushedBack | null {
  const ops = pushedBackOps(pushes, cause, state);
  if (ops === null || ops.length === 0) return null;
  const count = ops.length;
  return {
    ops,
    line: t({
      id: 'plan.retime.backToWhere',
      message: plural(count, {
        one: '# later stop moves back to where it was.',
        other: '# later stops move back to where they were.',
      }),
    }),
  };
}
