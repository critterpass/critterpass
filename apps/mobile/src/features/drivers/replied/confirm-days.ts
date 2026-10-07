/**
 * What the traveller tells a driver once the crew's vote set him on his days: the days a vote set
 * (never a day set by hand, which was told from the pick sheet), each with its window and the pin
 * of its first stop, and the price a day the crew agreed.
 */
import { mapsPin } from '@cp/domain';

export interface VotedAssignment {
  readonly day_date: string;
  readonly provider_id: string;
  readonly window_start: string | null;
  readonly window_end: string | null;
  /** The terms agreed, as the synced row carries them (JSON text). */
  readonly agreed: string | null;
  readonly change_set_id: string | null;
}

export interface ConfirmDay {
  readonly date: string;
  readonly window: string | null;
  readonly pin: string | null;
}

export interface DriverConfirm {
  readonly days: readonly ConfirmDay[];
  readonly price: { readonly minor: number; readonly currency: string } | null;
}

interface PlanDay {
  readonly date: string;
  readonly stops: readonly { readonly lat: number; readonly lng: number }[];
}

function priceOf(agreed: string | null): DriverConfirm['price'] {
  if (agreed === null) return null;
  try {
    const terms = JSON.parse(agreed) as { price_minor?: unknown; currency?: unknown } | null;
    return typeof terms?.price_minor === 'number' && typeof terms.currency === 'string'
      ? { minor: terms.price_minor, currency: terms.currency }
      : null;
  } catch {
    return null;
  }
}

/** Null until a vote has set this driver on a day. */
export function driverConfirmOf(
  assignments: readonly VotedAssignment[],
  providerId: string,
  planDays: readonly PlanDay[],
): DriverConfirm | null {
  const voted = assignments
    .filter((row) => row.provider_id === providerId && row.change_set_id !== null)
    .sort((a, b) => a.day_date.localeCompare(b.day_date));
  const first = voted[0];
  if (first === undefined) return null;
  return {
    days: voted.map((row) => {
      const stop = planDays.find((day) => day.date === row.day_date)?.stops[0];
      return {
        date: row.day_date,
        window:
          row.window_start === null || row.window_end === null
            ? null
            : `${row.window_start}–${row.window_end}`,
        pin: stop === undefined ? null : mapsPin(stop.lat, stop.lng),
      };
    }),
    price: priceOf(first.agreed),
  };
}

/** The lines of the message, one per day: "Wed 14 · 06:30–18:00 · <pin>". */
export function confirmLines(confirm: DriverConfirm, dayLabel: (date: string) => string): string {
  return confirm.days
    .map((day) =>
      [dayLabel(day.date), day.window, day.pin]
        .filter((part): part is string => part !== null)
        .join(' · '),
    )
    .join('\n');
}
