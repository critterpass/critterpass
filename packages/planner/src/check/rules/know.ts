/**
 * Worth knowing, nothing to fix: a packed day (six stops or more per nine hours by default;
 * "It works, just.") and a booking whose free cancellation or hold ends before the trip starts.
 */
import type { CheckIssueDraft, CheckInput } from '../types';
import type { CheckDay } from './shared';

const NINE_HOURS = 9 * 60;

export function paceIssues(check: CheckDay): CheckIssueDraft[] {
  const { model, day, input } = check;
  const stops = model.items.length;
  const first = model.items[0];
  if (first === undefined) return [];
  const span = Math.max(...model.items.map((item) => item.end)) - first.start;
  const perNine = (stops * NINE_HOURS) / Math.max(NINE_HOURS, span);
  if (perNine < input.thresholds.paceStopsPer9h) return [];
  return [
    {
      kind: 'pace',
      severity: 'know',
      dayId: day.dayId,
      dayNo: day.dayNo,
      stableIds: [],
      params: { stops, limit: input.thresholds.paceStopsPer9h },
      fix: { kind: 'none' },
    },
  ];
}

export function bookingNotes(input: CheckInput, tripStart: Date | null): CheckIssueDraft[] {
  if (tripStart === null) return [];
  return input.bookings
    .filter((booking) => booking.deadline > input.now && booking.deadline < tripStart)
    .map((booking) => ({
      kind: 'booking_note' as const,
      severity: 'know' as const,
      dayId: null,
      dayNo: null,
      stableIds: [],
      params: {
        booking_id: booking.bookingId,
        deadline: booking.deadline.toISOString(),
        kind: booking.kind,
      },
      fix: { kind: 'none' as const },
    }));
}
