/**
 * Closed: an item sits outside its place's opening spans that day (our own hours only; unknown
 * hours are never called closed). The one-tap fix moves it within that day's spans when a free
 * start exists.
 */
import { openThrough } from '@cp/domain';

import { clockOf } from '../../fit/day-model';
import { feasibleStart, retimeOp } from '../retime';
import type { CheckIssueDraft } from '../types';
import { spansOf, travelFor, type CheckDay } from './shared';

export function closedIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, context } = check;
  return model.items.flatMap((item) => {
    const spans = spansOf(check, item);
    if (spans === null || openThrough(spans, item.start, item.end) !== null) return [];
    const move = feasibleStart(model, item, travelFor(check), spans, 'either');
    const first = spans[0];
    const last = spans[spans.length - 1];
    return [
      {
        kind: 'closed' as const,
        severity: 'fix' as const,
        dayId: day.dayId,
        dayNo: day.dayNo,
        stableIds: [item.stableId],
        params: {
          stable_id: item.stableId,
          opens_at: first === undefined ? null : clockOf(first.start),
          closes_at: last === undefined ? null : clockOf(last.end),
          closed_all_day: spans.length === 0,
        },
        fix:
          move === null
            ? { kind: 'none' as const }
            : {
                kind: 'apply' as const,
                ops: [retimeOp(model, item, move, context.tz, 'check_fix_closed')],
              },
      },
    ];
  });
}
