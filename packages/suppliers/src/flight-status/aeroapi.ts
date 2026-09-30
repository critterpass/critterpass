/**
 * FlightAware AeroAPI v4 (docs/api-contracts.md §7, server-only): the flight by ident or by
 * `fa_flight_id`, and alert registration (departure, arrival, gate, delay, cancel, divert pushed to
 * `/webhooks/aeroapi`). The key travels in the `x-apikey` header, never the URL. Every call goes
 * through the audited supplier client (fixed egress, 120 s cap), and is counted against the
 * per-user alert budget by the caller.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../core/http';
import type { FlightSnapshot } from './types';

export const AEROAPI_SUPPLIER = 'flightaware';
const DEFAULT_BASE_URL = 'https://aeroapi.flightaware.com/aeroapi';

export interface AeroApiConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

const iso = z.string().nullable().optional();
export const aeroFlightSchema = z.object({
  fa_flight_id: z.string(),
  ident: z.string(),
  ident_iata: z.string().nullable().optional(),
  operator_iata: z.string().nullable().optional(),
  flight_number: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  cancelled: z.boolean().optional(),
  diverted: z.boolean().optional(),
  departure_delay: z.number().nullable().optional(),
  scheduled_out: iso,
  estimated_out: iso,
  actual_out: iso,
  scheduled_in: iso,
  estimated_in: iso,
  actual_in: iso,
  actual_off: iso,
  actual_on: iso,
  gate_origin: z.string().nullable().optional(),
  terminal_origin: z.string().nullable().optional(),
  origin: z.object({ code_iata: z.string().nullable().optional() }).nullable().optional(),
  destination: z.object({ code_iata: z.string().nullable().optional() }).nullable().optional(),
});
export type AeroFlight = z.infer<typeof aeroFlightSchema>;

const flightsSchema = z.object({ flights: z.array(aeroFlightSchema) });

/** What AeroAPI posts to the alert endpoint (the flight inside is not trusted until refetched). */
export const aeroAlertPayloadSchema = z.object({
  alert_id: z.union([z.number(), z.string()]).transform(String),
  event_code: z.string().max(40),
  flight: z.object({ fa_flight_id: z.string().max(128), ident: z.string().max(16) }).passthrough(),
});
export type AeroAlertPayload = z.infer<typeof aeroAlertPayloadSchema>;

function statusOf(flight: AeroFlight): FlightSnapshot['status'] {
  if (flight.cancelled === true) return 'cancelled';
  if (flight.diverted === true) return 'diverted';
  if (flight.actual_in != null || flight.actual_on != null) return 'landed';
  if (flight.actual_out != null || flight.actual_off != null) return 'departed';
  const delay = flight.departure_delay ?? 0;
  if (delay >= 15 * 60) return 'delayed';
  return flight.estimated_out != null ? 'on_time' : 'scheduled';
}

export function snapshotFromAero(flight: AeroFlight): FlightSnapshot | null {
  const ident = flight.ident_iata ?? flight.ident;
  const carrier = flight.operator_iata ?? /^[A-Z0-9]{2}/u.exec(ident)?.[0] ?? null;
  const flightNo = flight.flight_number ?? /\d{1,4}[A-Z]?$/u.exec(ident)?.[0] ?? null;
  if (carrier === null || flightNo === null) return null;
  return {
    provider: 'flightaware',
    providerFlightId: flight.fa_flight_id,
    carrier,
    flightNo: flightNo.replace(/^0+(?=\d)/u, ''),
    depAirport: flight.origin?.code_iata ?? null,
    arrAirport: flight.destination?.code_iata ?? null,
    schedDepAt: flight.scheduled_out ?? null,
    schedArrAt: flight.scheduled_in ?? null,
    estDepAt: flight.estimated_out ?? null,
    estArrAt: flight.estimated_in ?? null,
    actDepAt: flight.actual_out ?? flight.actual_off ?? null,
    actArrAt: flight.actual_in ?? flight.actual_on ?? null,
    gate: flight.gate_origin ?? null,
    terminal: flight.terminal_origin ?? null,
    status: statusOf(flight),
    delayMin: flight.departure_delay == null ? null : Math.round(flight.departure_delay / 60),
    boardingAt: null,
  };
}

export interface AeroApiClient {
  flightById(faFlightId: string): Promise<FlightSnapshot | null>;
  flightsByIdent(ident: string, start: string, end: string): Promise<FlightSnapshot[]>;
  createAlert(input: {
    readonly ident: string;
    readonly origin: string;
    readonly destination: string;
    readonly start: string;
    readonly end: string;
  }): Promise<string>;
  deleteAlert(alertId: string): Promise<void>;
}

export function createAeroApiClient(http: SupplierHttp, config: AeroApiConfig): AeroApiClient {
  const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, '');
  const headers = { 'x-apikey': config.apiKey, accept: 'application/json' };
  const request = (endpoint: string, url: string) => ({
    supplier: AEROAPI_SUPPLIER,
    endpoint,
    url,
    headers,
    timeoutMs: 120_000,
  });
  return {
    async flightById(faFlightId) {
      const body = await http.getJson(
        request('flight_by_id', `${base}/flights/${encodeURIComponent(faFlightId)}`),
        flightsSchema,
      );
      const flight = body.flights.find((candidate) => candidate.fa_flight_id === faFlightId);
      return flight === undefined ? null : snapshotFromAero(flight);
    },
    async flightsByIdent(ident, start, end) {
      const url = `${base}/flights/${encodeURIComponent(ident)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      const body = await http.getJson(request('flights_by_ident', url), flightsSchema);
      return body.flights
        .map(snapshotFromAero)
        .filter((snapshot): snapshot is FlightSnapshot => snapshot !== null);
    },
    async createAlert(input) {
      const response = await http.request({
        ...request('create_alert', `${base}/alerts`),
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          ident: input.ident,
          origin: input.origin,
          destination: input.destination,
          start: input.start,
          end: input.end,
          events: {
            arrival: true,
            cancelled: true,
            departure: true,
            diverted: true,
            filed: false,
            out: true,
            off: false,
            on: false,
            in: true,
          },
        }),
      });
      const parsed = z
        .object({ id: z.union([z.number(), z.string()]).transform(String) })
        .safeParse(JSON.parse(response.body || '{}'));
      if (!parsed.success) throw new Error('aeroapi create_alert returned no alert id');
      return parsed.data.id;
    },
    async deleteAlert(alertId) {
      await http.request({
        ...request('delete_alert', `${base}/alerts/${encodeURIComponent(alertId)}`),
        method: 'DELETE',
      });
    },
  };
}
