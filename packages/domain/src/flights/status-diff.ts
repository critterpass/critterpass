/**
 * What changed on a flight between the stored segment and a provider's fresh reading, and the
 * fields to store. A change is reported once: a replayed reading reports nothing. Delays count from
 * 15 minutes and are reported again only when they move by 10 more; a gate counts once announced
 * and whenever it moves; a flight never goes back from departed or landed on a stale reading.
 */
import type { FlightChange } from '../bookings/events';
import type { FlightStatus } from '../bookings/kinds';

export const DELAY_REPORT_MIN = 15;
export const DELAY_STEP_MIN = 10;

export interface StoredFlight {
  readonly status: FlightStatus;
  readonly gate: string | null;
  readonly delayMin: number | null;
}

export interface FlightReading {
  readonly status: FlightStatus;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly delayMin: number | null;
  readonly estDepAt: string | null;
  readonly estArrAt: string | null;
  readonly actDepAt: string | null;
  readonly actArrAt: string | null;
}

const RANK: Readonly<Record<FlightStatus, number>> = {
  scheduled: 0,
  on_time: 0,
  delayed: 0,
  boarding: 1,
  departed: 2,
  diverted: 3,
  landed: 3,
  cancelled: 3,
};

export interface FlightDiff {
  readonly changes: readonly FlightChange[];
  /** The status to store (never a step back). */
  readonly status: FlightStatus;
}

export function diffFlight(stored: StoredFlight, reading: FlightReading): FlightDiff {
  const status = RANK[reading.status] >= RANK[stored.status] ? reading.status : stored.status;
  const changes: FlightChange[] = [];
  const moved = (to: FlightStatus) => status === to && stored.status !== to;
  if (moved('cancelled')) changes.push('cancelled');
  if (moved('diverted')) changes.push('diverted');
  if (moved('departed')) changes.push('departed');
  if (moved('landed')) changes.push('landed');
  const delay = reading.delayMin;
  if (
    RANK[status] < 2 &&
    delay !== null &&
    delay >= DELAY_REPORT_MIN &&
    (stored.delayMin === null ||
      stored.delayMin < DELAY_REPORT_MIN ||
      Math.abs(delay - stored.delayMin) >= DELAY_STEP_MIN)
  ) {
    changes.push('delay');
  }
  if (RANK[status] < 2 && reading.gate !== null && reading.gate !== stored.gate)
    changes.push('gate');
  return { changes, status };
}

/** Changes the traveller hears about at once (N-14): the rest are events and card updates. */
export const PUSHED_FLIGHT_CHANGES: ReadonlySet<FlightChange> = new Set([
  'delay',
  'gate',
  'cancelled',
  'diverted',
]);
