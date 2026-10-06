/**
 * Picking a driver for days (6d-2): which of the plan's days can take him (a day set on another
 * driver is TAKEN and locked), which picked days run longer than the hours his price covers (the
 * overtime warning), and the `assign_provider` payload for the days picked. Pure, so the sheet and
 * the server agree.
 */
import type { AssignProviderPayload } from '@cp/domain';

export interface PickableDay {
  readonly date: string;
  readonly window: { readonly start: string; readonly end: string } | null;
  /** Where the driver picks up that morning, as text for the message and the card. */
  readonly pickup: string | null;
  /** The driver already set on this day, if any. */
  readonly assignedProviderId: string | null;
}

export interface PickDay extends PickableDay {
  readonly taken: boolean;
  readonly hours: number | null;
  readonly overHours: boolean;
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export function windowHoursOf(window: PickableDay['window']): number | null {
  if (window === null) return null;
  const span = minutes(window.end) - minutes(window.start);
  return (span < 0 ? span + 24 * 60 : span) / 60;
}

export function pickDays(
  days: readonly PickableDay[],
  providerId: string,
  includedHours: number | null,
): PickDay[] {
  return days.map((day) => {
    const hours = windowHoursOf(day.window);
    return {
      ...day,
      taken: day.assignedProviderId !== null && day.assignedProviderId !== providerId,
      hours,
      overHours: includedHours !== null && hours !== null && hours > includedHours,
    };
  });
}

/** The payload for the picked dates; TAKEN days are never included. */
export function assignProviderPayload(
  tripId: string,
  providerId: string,
  days: readonly PickDay[],
  picked: ReadonlySet<string>,
): AssignProviderPayload | null {
  const chosen = days.filter((day) => picked.has(day.date) && !day.taken);
  if (chosen.length === 0) return null;
  return {
    trip_id: tripId,
    provider_id: providerId,
    days: chosen.map((day) => ({
      date: day.date,
      window_start: day.window?.start ?? null,
      window_end: day.window?.end ?? null,
      pickup: day.pickup,
    })),
  };
}
