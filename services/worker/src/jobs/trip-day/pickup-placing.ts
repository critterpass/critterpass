/**
 * A transfer booked by hand has a pickup text but no place, so its leave-by had nothing to route
 * to. Before the leave-bys are computed, each transfer item without a place gets its booking's
 * pickup placed, once per pickup text: on one of the destination's own POIs, else a Mapbox
 * permanent geocode (stored, as Mapbox Product Terms §2.7.3 allow). The answer, placed or not, is
 * kept in the booking's `details.pickup_point`, so the same text is never looked up twice; a
 * Mapbox failure keeps nothing and the next recompute asks again.
 */
import { ownPlaceMatches, withSystem } from '@cp/db';
import type { LatLng, PickupPoint } from '@cp/domain';
import {
  acceptAddress,
  acceptOwnPlace,
  currentPickupPoint,
  PICKUP_RADIUS_M,
  pickupNeedsPlacing,
  pickupText,
  type AddressCandidate,
  type PlacedPickup,
} from '@cp/planner';
import { geocodeForwardMapbox, type MapboxHttpClient } from '@cp/suppliers';
import type pg from 'pg';

import type { PlanItemRow } from './plan-items';

/** Street addresses near a point, as the geocoder found them for a pickup text. */
export interface PickupGeocoder {
  addresses(text: string, near: LatLng): Promise<readonly AddressCandidate[]>;
}

export function mapboxPickupGeocoder(options: {
  readonly accessToken: string;
  readonly http?: MapboxHttpClient;
}): PickupGeocoder {
  return {
    addresses: (text, near) =>
      geocodeForwardMapbox(text, { accessToken: options.accessToken }, options.http, {
        types: ['address'],
        proximity: near,
      }),
  };
}

/** The destination's centre: its geofence's, else the middle of its active POIs. */
async function destinationCentre(
  tx: pg.PoolClient,
  tripId: string,
): Promise<{
  readonly destinationId: string;
  readonly centre: LatLng;
} | null> {
  const { rows } = await tx.query<{
    destination_id: string;
    lat: number | null;
    lng: number | null;
  }>(
    `SELECT d.id AS destination_id,
            ST_Y(c.point) AS lat, ST_X(c.point) AS lng
       FROM trips t JOIN destinations d ON d.id = t.destination_id
       CROSS JOIN LATERAL (
         SELECT coalesce(
           ST_Centroid(d.geofence::geometry),
           (SELECT ST_Centroid(ST_Collect(p.location::geometry)) FROM pois p
             WHERE p.destination_id = d.id AND p.status = 'active')) AS point
       ) AS c
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined || row.lat === null || row.lng === null) return null;
  return { destinationId: row.destination_id, centre: { lat: row.lat, lng: row.lng } };
}

async function place(
  pool: pg.Pool,
  tripId: string,
  text: string,
  geocoder: PickupGeocoder | undefined,
): Promise<PickupPoint | null> {
  const own = await withSystem(pool, async (tx) => {
    const area = await destinationCentre(tx, tripId);
    if (area === null) return { area: null, placed: null };
    const matches = await ownPlaceMatches(tx, text, {
      destinationId: area.destinationId,
      ...area.centre,
      radiusM: PICKUP_RADIUS_M,
    });
    return { area, placed: acceptOwnPlace(matches, area.centre) };
  });
  // No destination to bound the search by: nothing can be placed, and nothing is kept.
  if (own.area === null) return null;
  const stored = (placed: PlacedPickup): PickupPoint => ({
    from_text: text,
    lat: placed.lat,
    lng: placed.lng,
    label: placed.label.slice(0, 300),
    source: placed.source,
    ...(placed.poiId === undefined ? {} : { poi_id: placed.poiId }),
  });
  if (own.placed !== null) return stored(own.placed);
  // Without a geocoder only our own places were asked; a later recompute may still ask Mapbox.
  if (geocoder === undefined) return null;
  let addresses: readonly AddressCandidate[];
  try {
    addresses = await geocoder.addresses(text, own.area.centre);
  } catch {
    return null;
  }
  const address = acceptAddress(addresses, own.area.centre);
  return address === null ? { from_text: text, unresolved: true } : stored(address);
}

/**
 * The plan items with each transfer's pickup standing in for its missing place, placing any pickup
 * text not placed before and keeping the answer on its booking.
 */
export async function withPickupPlaces(
  pool: pg.Pool,
  tripId: string,
  items: readonly PlanItemRow[],
  geocoder: PickupGeocoder | undefined,
): Promise<PlanItemRow[]> {
  const placedByBooking = new Map<string, PickupPoint | null>();
  const out: PlanItemRow[] = [];
  for (const item of items) {
    const transfer = item.transfer;
    if (transfer === null || (item.lat !== null && item.lng !== null)) {
      out.push(item);
      continue;
    }
    let details = transfer.details;
    if (pickupNeedsPlacing(transfer)) {
      const text = pickupText(transfer) as string;
      if (!placedByBooking.has(transfer.booking_id)) {
        const point = await place(pool, tripId, text, geocoder);
        placedByBooking.set(transfer.booking_id, point);
        if (point !== null) {
          await withSystem(pool, (tx) =>
            tx.query(
              `UPDATE bookings
                  SET details = jsonb_set(coalesce(details, '{}'::jsonb), '{pickup_point}', $2::jsonb)
                WHERE id = $1`,
              [transfer.booking_id, JSON.stringify(point)],
            ),
          );
        }
      }
      const point = placedByBooking.get(transfer.booking_id);
      if (point != null) details = { ...details, pickup_point: point };
    }
    const pickup = currentPickupPoint({ ...transfer, details });
    out.push(pickup === null ? item : { ...item, lat: pickup.lat, lng: pickup.lng });
  }
  return out;
}
