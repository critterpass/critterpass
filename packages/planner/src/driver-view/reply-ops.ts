/**
 * A driver's suggested order and times as ChangeSet ops. The driver never edits the plan: each
 * stop whose time changes becomes one `retime` op the crew votes on. A new order keeps the day's
 * time slots and moves stops between them (each keeps its own length); an explicit new time for a
 * stop wins over its slot. Refs the day does not hold are ignored, so a stale page cannot touch
 * another day or another trip.
 */
import {
  localSchedule,
  type ChangeSetOp,
  type DriverPlanDaySuggestion,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';

export interface DriverReplyOpsInput {
  readonly state: PlanState;
  readonly dayNos: readonly number[];
  readonly suggestions: readonly DriverPlanDaySuggestion[];
  readonly tz: string;
}

const DRIVER_REASON = 'driver_suggestion';

function timed(item: PlanStateItem): item is PlanStateItem & { starts_at: string } {
  return item.starts_at !== undefined;
}

function lengthMs(item: PlanStateItem): number | null {
  if (item.starts_at === undefined || item.ends_at === undefined) return null;
  return Date.parse(item.ends_at) - Date.parse(item.starts_at);
}

function dayStarts(
  items: readonly PlanStateItem[],
  suggestion: DriverPlanDaySuggestion,
  date: string | null,
  tz: string,
): Map<string, number> {
  const byRef = new Map(items.map((item) => [item.stable_id, item]));
  const timedItems = items.filter(timed);
  const slots = timedItems.map((item) => Date.parse(item.starts_at)).sort((a, b) => a - b);
  const order = suggestion.order.filter((ref) => byRef.get(ref)?.starts_at !== undefined);
  const starts = new Map<string, number>();
  // Only a full reorder of the timed stops moves them between slots.
  if (order.length === timedItems.length && new Set(order).size === order.length) {
    order.forEach((ref, i) => starts.set(ref, slots[i] as number));
  }
  if (date !== null) {
    for (const { ref, at } of suggestion.retime) {
      if (byRef.has(ref)) starts.set(ref, localSchedule({ date, time: at, tz }).getTime());
    }
  }
  return starts;
}

export function driverReplyOps(input: DriverReplyOpsInput): ChangeSetOp[] {
  const shared = new Set(input.dayNos);
  const ops: ChangeSetOp[] = [];
  for (const suggestion of input.suggestions) {
    if (!shared.has(suggestion.day_no)) continue;
    const day = input.state.days.find((d) => d.day_no === suggestion.day_no);
    if (day === undefined) continue;
    const items = input.state.items.filter((item) => item.day_no === suggestion.day_no);
    const starts = dayStarts(items, suggestion, day.date ?? null, input.tz);
    for (const item of items) {
      const start = starts.get(item.stable_id);
      if (start === undefined || (item.starts_at && Date.parse(item.starts_at) === start)) continue;
      const length = lengthMs(item);
      ops.push({
        op: 'retime',
        target: item.stable_id,
        after: {
          starts_at: new Date(start).toISOString(),
          ...(length === null ? {} : { ends_at: new Date(start + length).toISOString() }),
        },
        reason: suggestion.note ?? DRIVER_REASON,
        affected_user_ids: [],
        booking_impact: item.booking_id !== null && item.booking_id !== undefined,
      });
    }
  }
  return ops;
}
