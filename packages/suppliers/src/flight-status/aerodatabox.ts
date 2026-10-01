/**
 * AeroDataBox (flight status by number and local date; server-only): the schedule checks at T−24 h,
 * T−6 h and T−3 h, and the whole status source when AeroAPI is not configured. The key travels in
 * the `X-RapidAPI-Key` header. Audited through the supplier client like every supplier call. Each
 * request is billed against a small monthly plan, so a failed read is never retried here: the
 * caller decides whether another call is worth spending.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../core/http';
import type { FlightSnapshot } from './types';

export const AERODATABOX_SUPPLIER = 'aerodatabox';
const DEFAULT_BASE_URL = 'https://aerodatabox.p.rapidapi.com';
const DEFAULT_HOST = 'aerodatabox.p.rapidapi.com';

export interface AeroDataBoxConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly host?: string;
}

const time = z
  .object({ utc: z.string().optional(), local: z.string().optional() })
  .nullable()
  .optional();
const movement = z.object({
  airport: z.object({ iata: z.string().nullable().optional() }).nullable().optional(),
  scheduledTime: time,
  revisedTime: time,
  predictedTime: time,
  runwayTime: time,
  terminal: z.string().nullable().optional(),
  gate: z.string().nullable().optional(),
});
export const adbFlightSchema = z.object({
  number: z.string(),
  status: z.string(),
  departure: movement,
  arrival: movement,
  airline: z.object({ iata: z.string().nullable().optional() }).nullable().optional(),
});
export type AdbFlight = z.infer<typeof adbFlightSchema>;

/** "2026-10-12 01:40Z" → ISO. */
function utc(value: { utc?: string | undefined } | null | undefined): string | null {
  const raw = value?.utc;
  if (raw === undefined) return null;
  const parsed = Date.parse(raw.replace(' ', 'T').replace(/Z?$/u, 'Z'));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function statusOf(raw: string, delayMin: number | null): FlightSnapshot['status'] {
  switch (raw.toLowerCase()) {
    case 'canceled':
    case 'cancelled':
    case 'canceleduncertain':
      return 'cancelled';
    case 'diverted':
      return 'diverted';
    case 'arrived':
    case 'landed':
      return 'landed';
    case 'departed':
    case 'enroute':
    case 'approaching':
      return 'departed';
    case 'boarding':
    case 'gateclosed':
      return 'boarding';
    case 'delayed':
      return 'delayed';
    default:
      return delayMin !== null && delayMin >= 15 ? 'delayed' : 'scheduled';
  }
}

export function snapshotFromAdb(flight: AdbFlight): FlightSnapshot | null {
  const number = /^([A-Z0-9]{2})\s*0*(\d{1,4}[A-Z]?)$/u.exec(flight.number.trim().toUpperCase());
  if (number === null) return null;
  const sched = utc(flight.departure.scheduledTime);
  const revised = utc(flight.departure.revisedTime) ?? utc(flight.departure.predictedTime);
  const delayMin =
    sched !== null && revised !== null
      ? Math.round((Date.parse(revised) - Date.parse(sched)) / 60_000)
      : null;
  const status = statusOf(flight.status, delayMin);
  return {
    provider: 'aerodatabox',
    providerFlightId: null,
    carrier: flight.airline?.iata ?? number[1] ?? '',
    flightNo: number[2] ?? '',
    depAirport: flight.departure.airport?.iata ?? null,
    arrAirport: flight.arrival.airport?.iata ?? null,
    schedDepAt: sched,
    schedArrAt: utc(flight.arrival.scheduledTime),
    estDepAt: revised,
    estArrAt: utc(flight.arrival.revisedTime) ?? utc(flight.arrival.predictedTime),
    actDepAt:
      status === 'departed' || status === 'landed' ? utc(flight.departure.runwayTime) : null,
    actArrAt:
      status === 'landed'
        ? (utc(flight.arrival.runwayTime) ?? utc(flight.arrival.revisedTime))
        : null,
    gate: flight.departure.gate ?? null,
    terminal: flight.departure.terminal ?? null,
    status,
    delayMin,
    boardingAt: null,
  };
}

export interface AeroDataBoxClient {
  /** Flights with this number on a local departure date (`YYYY-MM-DD`). */
  flightsOn(carrier: string, number: string, localDate: string): Promise<FlightSnapshot[]>;
}

export function createAeroDataBoxClient(
  http: SupplierHttp,
  config: AeroDataBoxConfig,
): AeroDataBoxClient {
  const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, '');
  return {
    async flightsOn(carrier, number, localDate) {
      const url = `${base}/flights/number/${encodeURIComponent(`${carrier}${number}`)}/${localDate}?withAircraftImage=false&withLocation=false`;
      const flights = await http.getJson(
        {
          supplier: AERODATABOX_SUPPLIER,
          endpoint: 'flights_by_number',
          url,
          headers: {
            'X-RapidAPI-Key': config.apiKey,
            'X-RapidAPI-Host': config.host ?? DEFAULT_HOST,
          },
          timeoutMs: 30_000,
          retries: 0,
        },
        z.array(adbFlightSchema),
      );
      return flights
        .map(snapshotFromAdb)
        .filter((snapshot): snapshot is FlightSnapshot => snapshot !== null);
    },
  };
}
