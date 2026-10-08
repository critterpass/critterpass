/**
 * Getting around's data: the trip (wallet context), today's planned stops with their places, the
 * wallet's transfers, the last ride quote this phone synced (for airplane mode) and, online, a
 * fresh `/v1/rides/quote` and the driving time for the chosen leg.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and wire values. */
import type { RideQuoteResult } from '@cp/domain';
import { getForegroundPermissionsAsync, getLastKnownPositionAsync } from 'expo-location';
import { useEffect, useMemo, useState } from 'react';

import { useLiveRows } from '../data/live-rows';
import { useWalletContext } from '../data/use-wallet-context';
import { deviceSupplierApi, type SupplierApi } from '../supplier/data/api';
import {
  chooseLeg,
  nextTransfer,
  todaysStops,
  type LegChoice,
  type Place,
  type PlanStop,
  type TransferBooking,
} from './model';

const TRIP_SQL = `SELECT coalesce(t.tz, d.tz) AS tz, t.local_currency, d.country
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;
const STOPS_SQL = `SELECT pi.stable_id, pi.starts_at, pi.attendee_ids, p.id AS poi_id, p.name,
    p.name_local, p.address, p.lat, p.lng
  FROM plan_items pi
  JOIN trips t ON t.id = pi.trip_id AND t.current_version_id = pi.version_id
  JOIN pois p ON p.id = pi.poi_id
  WHERE pi.trip_id = ? AND pi.starts_at IS NOT NULL AND p.lat IS NOT NULL
  ORDER BY pi.starts_at`;
const POIS_SQL = `SELECT id AS poi_id, name, name_local, address, lat, lng FROM pois WHERE id IN (?, ?)`;
const TRANSFERS_SQL = `SELECT id, title, supplier, starts_at, details FROM bookings
  WHERE trip_id = ? AND type = 'transfer' AND status <> 'cancelled' AND deleted_at IS NULL`;
const QUOTE_SQL = `SELECT fare_low_minor, fare_high_minor, currency, eta_min, fetched_at FROM ride_quotes
  WHERE trip_id = ? AND to_poi_id = ? ORDER BY fetched_at DESC LIMIT 1`;

interface PoiRow {
  readonly poi_id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly address: string | null;
  readonly lat: number;
  readonly lng: number;
}

export interface SyncedQuote {
  readonly fare_low_minor: number | null;
  readonly fare_high_minor: number | null;
  readonly currency: string | null;
  readonly eta_min: number | null;
  readonly fetched_at: string;
}

export type QuoteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly quote: RideQuoteResult }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error' };

export interface GettingAround {
  readonly status: 'loading' | 'no_trip' | 'no_place' | 'ready';
  readonly tripId: string | null;
  readonly country: string | null;
  readonly tz: string;
  readonly localCurrency: string | null;
  /** What the crew settles in: a ride's cost is typed in it when the trip has no local currency. */
  readonly crewCurrency: string;
  readonly leg: LegChoice;
  readonly transfer: TransferBooking | null;
  readonly quote: QuoteState;
  readonly synced: SyncedQuote | null;
  readonly driveMinutes: number | null;
  /** Where the pickup is when no planned stop comes before (the phone's last known place). */
  readonly here: { readonly lat: number; readonly lng: number } | null;
  readonly uid: string | null;
}

function place(row: PoiRow): Place {
  return {
    poiId: row.poi_id,
    name: row.name,
    nameLocal: row.name_local,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
  };
}

function ids(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function useGettingAround(
  ask: { readonly tripId?: string; readonly to?: string; readonly from?: string },
  api: SupplierApi = deviceSupplierApi,
): GettingAround {
  const context = useWalletContext();
  const tripId = ask.tripId ?? context.trip?.id ?? null;
  const trip = useLiveRows<{
    tz: string | null;
    local_currency: string | null;
    country: string | null;
  }>(TRIP_SQL, tripId === null ? null : [tripId], ['trips', 'destinations']);
  const stops = useLiveRows<
    PoiRow & { stable_id: string; starts_at: string; attendee_ids: string | null }
  >(STOPS_SQL, tripId === null ? null : [tripId], ['plan_items', 'trips', 'pois']);
  const asked = useLiveRows<PoiRow>(POIS_SQL, ask.to ? [ask.to, ask.from ?? ask.to] : null, [
    'pois',
  ]);
  const transfers = useLiveRows<{
    id: string;
    title: string;
    supplier: string | null;
    starts_at: string | null;
    details: string | null;
  }>(TRANSFERS_SQL, tripId === null ? null : [tripId], ['bookings']);
  const tz = trip.rows[0]?.tz ?? 'UTC';
  const now = useMemo(() => new Date(), []);
  const leg = useMemo(() => {
    const planStops: PlanStop[] = stops.rows.map((row) => ({
      ...place(row),
      stableId: row.stable_id,
      startsAt: row.starts_at,
      attendeeIds: ids(row.attendee_ids),
    }));
    const toRow = asked.rows.find((row) => row.poi_id === ask.to);
    const fromRow = asked.rows.find((row) => row.poi_id === ask.from);
    return chooseLeg(todaysStops(planStops, now, tz), now, {
      toPoi: toRow ? place(toRow) : null,
      fromPoi: fromRow ? place(fromRow) : null,
    });
  }, [stops.rows, asked.rows, ask.to, ask.from, now, tz]);
  const synced =
    useLiveRows<SyncedQuote>(
      QUOTE_SQL,
      tripId === null || leg.to === null ? null : [tripId, leg.to.poiId],
      ['ride_quotes'],
    ).rows[0] ?? null;

  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [answer, setAnswer] = useState<{ readonly key: string; readonly state: QuoteState } | null>(
    null,
  );
  const [driveMinutes, setDriveMinutes] = useState<number | null>(null);
  const toId = leg.to?.poiId ?? null;
  const fromKey = leg.from ? leg.from.poiId : here ? `${here.lat},${here.lng}` : null;

  useEffect(() => {
    if (leg.from !== null || toId === null) return undefined;
    let live = true;
    void getForegroundPermissionsAsync()
      .then((permission) =>
        permission.granted ? getLastKnownPositionAsync({ maxAge: 10 * 60_000 }) : null,
      )
      .then((position) => {
        if (live && position)
          setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [leg.from, toId]);

  useEffect(() => {
    if (tripId === null || toId === null || fromKey === null || leg.to === null) return undefined;
    let live = true;
    const origin = leg.from ?? here;
    const key = `${toId}|${fromKey}`;
    void api
      .rideQuote({
        tripId,
        toPoi: toId,
        ...(leg.from ? { fromPoi: leg.from.poiId } : here ? { from: here } : {}),
      })
      .then((outcome) => {
        if (!live) return;
        setAnswer({
          key,
          state:
            outcome.kind === 'ok'
              ? { kind: 'ready', quote: outcome.value }
              : { kind: outcome.kind === 'offline' ? 'offline' : 'error' },
        });
      });
    if (origin) {
      void api.driveMinutes(origin, leg.to).then((outcome) => {
        if (live && outcome.kind === 'ok') setDriveMinutes(outcome.value);
      });
    }
    return () => {
      live = false;
    };
    // `leg` and `here` are folded into the keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tripId, toId, fromKey]);

  const transfer = nextTransfer(
    transfers.rows.map((row) => {
      let details: { operator?: string; meeting_point?: string } = {};
      try {
        details = JSON.parse(row.details ?? '{}') as typeof details;
      } catch {
        details = {};
      }
      return {
        id: row.id,
        title: row.title,
        supplier: row.supplier,
        startsAt: row.starts_at,
        operator: details.operator ?? null,
        meetingPoint: details.meeting_point ?? null,
      };
    }),
    now,
  );

  const quoteKey = toId !== null && fromKey !== null ? `${toId}|${fromKey}` : null;
  const quote: QuoteState =
    quoteKey === null
      ? { kind: 'idle' }
      : answer?.key === quoteKey
        ? answer.state
        : { kind: 'loading' };

  const status =
    context.status === 'loading' || (tripId !== null && !stops.loaded)
      ? 'loading'
      : tripId === null
        ? 'no_trip'
        : leg.to === null
          ? 'no_place'
          : 'ready';
  return {
    status,
    tripId,
    country: trip.rows[0]?.country ?? null,
    tz,
    localCurrency: trip.rows[0]?.local_currency ?? null,
    crewCurrency: context.crewCurrency,
    leg,
    transfer,
    quote,
    synced,
    driveMinutes,
    here,
    uid: context.uid,
  };
}
