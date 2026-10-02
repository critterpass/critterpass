/**
 * One provider's reading of a flight, normalised: what the flight card and the status diff read.
 * Instants are ISO 8601 UTC; `null` means the provider did not say.
 */
import type { FlightStatus } from '@cp/domain';

export type FlightStatusProvider = 'flightaware' | 'aerodatabox';

export interface FlightSnapshot {
  readonly provider: FlightStatusProvider;
  /** The provider's own id for this flight instance (AeroAPI `fa_flight_id`). */
  readonly providerFlightId: string | null;
  readonly carrier: string;
  readonly flightNo: string;
  readonly depAirport: string | null;
  readonly arrAirport: string | null;
  readonly schedDepAt: string | null;
  readonly schedArrAt: string | null;
  readonly estDepAt: string | null;
  readonly estArrAt: string | null;
  readonly actDepAt: string | null;
  readonly actArrAt: string | null;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly status: FlightStatus;
  /** Departure delay in minutes (negative = early), when known. */
  readonly delayMin: number | null;
  /** The airline's boarding time, when the provider publishes one. */
  readonly boardingAt: string | null;
  /** The departure and arrival airports' IANA zones, when the provider names them. */
  readonly depTz?: string | null;
  readonly arrTz?: string | null;
}

/** "SQ938" / "SQ 938" → `{ carrier, number }`, or null. */
export function splitIdent(ident: string): { carrier: string; number: string } | null {
  const match = /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*0*(\d{1,4}[A-Z]?)$/u.exec(
    ident.trim().toUpperCase(),
  );
  return match === null ? null : { carrier: match[1] ?? '', number: match[2] ?? '' };
}
