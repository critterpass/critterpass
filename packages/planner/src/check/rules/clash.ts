/**
 * Clashes: two items of the same people overlap, or there is not enough time to travel between
 * them (`checkFeasibility` with the trip's legs). The one-tap fix is the move nearest the day as
 * it was that the places are for (`settleClash`); a locked item never moves.
 */

/** The open air is dark from half past six when the check is not told otherwise. */
const DARK_FROM_MIN = 18 * 60 + 30;
import { checkFeasibility } from '../../feasibility/check';
import type { FeasibilityItem } from '../../feasibility/types';
import { retimeOp, settleClash } from '../retime';
import type { CheckIssueDraft } from '../types';
import { itemOf, spansOf, travelFor, type CheckDay } from './shared';

export function clashIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, context } = check;
  const travel = travelFor(check);
  const items: FeasibilityItem[] = model.items.map((item) => ({
    stableId: item.stableId,
    startsAt: itemOf(day, item.stableId)?.startsAt ?? new Date(0),
    endsAt: itemOf(day, item.stableId)?.endsAt ?? new Date(0),
    tz: context.tz,
    attendeeIds: itemOf(day, item.stableId)?.attendeeIds ?? [],
  }));
  const byId = new Map(model.items.map((item) => [item.stableId, item]));
  const result = checkFeasibility({
    items,
    members: context.participants,
    travel: (from, to) => {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a?.point || !b?.point) return null;
      return travel({ key: from, ...a.point }, { key: to, ...b.point })?.minutes ?? null;
    },
  });
  return result.violations
    .filter((violation) => violation.code === 'OVERLAP' || violation.code === 'TRAVEL_TOO_LONG')
    .flatMap((violation) => {
      const second = violation.stableId === null ? undefined : byId.get(violation.stableId);
      const first = violation.relatedId === undefined ? undefined : byId.get(violation.relatedId);
      if (first === undefined || second === undefined) return [];
      const moves = settleClash(model, first, second, travel, (item) => ({
        spans: spansOf(check, item),
        what: {
          category: itemOf(day, item.stableId)?.category ?? null,
          outdoor: itemOf(day, item.stableId)?.outdoor ?? false,
          darkFromMin: check.input.darkFromMin ?? DARK_FROM_MIN,
        },
      }));
      const ops = (moves ?? []).map((move) =>
        retimeOp(model, move.item, move.start, context.tz, 'check_fix_clash'),
      );
      return [
        {
          kind: 'clash' as const,
          severity: 'fix' as const,
          dayId: day.dayId,
          dayNo: day.dayNo,
          stableIds: [first.stableId, second.stableId],
          params: {
            first: first.stableId,
            second: second.stableId,
            short_minutes: Math.round(violation.minutes ?? 0),
          },
          fix: ops.length === 0 ? { kind: 'none' as const } : { kind: 'apply' as const, ops },
        },
      ];
    });
}
