/**
 * The driver reads the app makes over HTTPS with the session headers: the trip's shared messages
 * and shortlist (`GET /v1/drivers`, kept on the phone for the offline ride-back card), reading a
 * shared message, and private tours (supplier content, held in screen state only).
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes and wire values, never copy. */
import type { DriverCard, IntakeItem, IntakeReadResult, Includes, PriceUnit } from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export type Outcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface DriverTerms {
  readonly source: 'found' | 'private_tour' | 'crews';
  readonly status: 'shortlisted' | 'archived';
  readonly area: string | null;
  readonly languages: readonly string[];
  readonly car: string | null;
  readonly seats: number | null;
  readonly price_minor: number | string | null;
  readonly currency: string | null;
  readonly price_unit: PriceUnit | null;
  readonly included_hours: number | string | null;
  readonly includes: Includes;
  readonly overtime_minor: number | string | null;
  readonly licence_shown: boolean | null;
  readonly supplier_ref: string | null;
}

export interface ShortlistDriver {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly vehicle: { readonly model?: string; readonly plate?: string } | null;
  readonly added_by: string | null;
  readonly terms: DriverTerms;
}

export interface DriversRead {
  readonly intake: readonly IntakeItem[];
  readonly drivers: readonly ShortlistDriver[];
}

export interface PrivateTourCard {
  readonly supplier: 'viator';
  readonly product_id: string;
  readonly title: string;
  readonly price_from: number | null;
  readonly currency: string | null;
  readonly product_url: string | null;
  readonly seen_at: string;
}

export interface PrivateTours {
  readonly area: string;
  readonly people: number;
  readonly cards: readonly PrivateTourCard[];
  readonly supplier_down: boolean;
  readonly links: readonly {
    readonly partner: 'klook' | 'viator';
    readonly api: boolean;
    readonly target: { readonly kind: 'activity'; readonly query: string; readonly date?: string };
  }[];
}

function codeOf(body: unknown, status: number): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : `HTTP_${String(status)}`;
}

async function call<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<Outcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method,
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return { kind: 'error', code: codeOf(body, response.status) };
  return { kind: 'ok', value: body as T };
}

export interface DriversApi {
  read(tripId: string): Promise<Outcome<DriversRead>>;
  readIntake(intakeId: string): Promise<Outcome<IntakeReadResult>>;
  privateTours(tripId: string, days: readonly string[]): Promise<Outcome<PrivateTours>>;
}

export const deviceDriversApi: DriversApi = {
  read: (tripId) => call(`/v1/drivers?trip_id=${encodeURIComponent(tripId)}`),
  readIntake: (intakeId) => call(`/v1/drivers/intake/${encodeURIComponent(intakeId)}/read`, 'POST'),
  privateTours: (tripId, days) => {
    const params = new URLSearchParams({ trip_id: tripId });
    if (days.length > 0) params.set('days', days.join(','));
    return call(`/v1/drivers/private-tours?${params.toString()}`);
  },
};

const num = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

/** A shortlisted driver as the compare table and the card read it. */
export function driverCardOf(driver: ShortlistDriver): DriverCard {
  const t = driver.terms;
  return {
    name: driver.name,
    phone: driver.phone,
    area: t.area,
    languages: [...t.languages],
    car: t.car,
    seats: t.seats,
    price_minor: num(t.price_minor),
    currency: t.currency,
    price_unit: t.price_unit,
    included_hours: num(t.included_hours),
    includes: t.includes,
    overtime_minor: num(t.overtime_minor),
    licence_shown: t.licence_shown,
  };
}
