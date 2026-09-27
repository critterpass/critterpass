/**
 * POI detail (docs/api-contracts.md §5.5 `GET /v1/places/{id}?trip_id`): current hours state,
 * Foursquare live-check flags (never raw content beyond the flags), and — when `trip_id` resolves to
 * a real lodging location — distance/time from it via the routing interface (a Valhalla-backed
 * provider will supply the real implementation later; the default here is the straight-line
 * fallback).
 */
import {
  editorialOverlaySchema,
  nextOpen,
  openAt,
  poiCategorySchema,
  straightLineEtaProvider,
  DomainError,
  type EditorialOverlay,
  type Hours,
  type PoiCategory,
  type RouteEtaProvider,
} from '@cp/domain';
import type pg from 'pg';

export interface PlaceDetailResult {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly priceLevel: number | null;
  readonly tags: readonly string[];
  readonly editorial: EditorialOverlay;
  readonly hours: Hours;
  readonly hoursVerifiedAt: string | null;
  readonly openNow: boolean | null;
  readonly nextOpenAt: string | null;
  readonly liveIsOpenNow: boolean | null;
  readonly closedPermanently: boolean;
  readonly liveCheckedAt: string | null;
  readonly distanceFromLodgingM?: number;
  readonly etaFromLodgingMinutes?: number;
  readonly etaFromLodgingIsEstimate?: boolean;
}

interface PlaceDetailRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly price_level: number | null;
  readonly tags: string[];
  readonly editorial: EditorialOverlay;
  readonly hours: Hours;
  readonly hours_verified_at: Date | null;
  readonly timezone: string | null;
  readonly destination_tz: string | null;
  readonly is_open_now: boolean | null;
  readonly closed_permanently: boolean | null;
  readonly live_checked_at: Date | null;
}

/**
 * A trip's lodging location, once one exists: no table carries it yet (bookings/wallet, the
 * day-by-day plan and trip setup all still need to land), so this always returns `undefined` today.
 * `getPlaceDetail` already treats that as "omit the lodging fields", which is the correct behaviour,
 * not a placeholder that blocks correctness: once one of those lands, this function is the one place
 * to make it a real lookup.
 */
function resolveTripLodging(
  _tx: pg.PoolClient,
  _tripId: string,
): Promise<{ readonly lat: number; readonly lng: number } | undefined> {
  return Promise.resolve(undefined);
}

export interface GetPlaceDetailOptions {
  readonly tripId?: string;
  readonly now?: Date;
  readonly routeEtaProvider?: RouteEtaProvider;
}

export async function getPlaceDetail(
  tx: pg.PoolClient,
  poiId: string,
  options: GetPlaceDetailOptions = {},
): Promise<PlaceDetailResult> {
  const { rows } = await tx.query<PlaceDetailRow>(
    `SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address, p.price_level, p.tags,
            p.editorial, p.hours, p.hours_verified_at, p.timezone, d.tz AS destination_tz,
            lc.is_open_now, lc.closed_permanently, lc.checked_at AS live_checked_at
     FROM pois p
     JOIN destinations d ON d.id = p.destination_id
     LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
     WHERE p.id = $1 AND p.status = 'active'`,
    [poiId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi not found', poiId });

  const now = options.now ?? new Date();
  const tz = row.timezone ?? row.destination_tz;
  const openNow = tz !== null ? openAt(row.hours, tz, now) : null;
  const nextOpenAt = tz !== null ? nextOpen(row.hours, tz, now) : null;

  const result: PlaceDetailResult = {
    id: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: poiCategorySchema.parse(row.category),
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    priceLevel: row.price_level,
    tags: row.tags,
    editorial: editorialOverlaySchema.parse(row.editorial),
    hours: row.hours,
    hoursVerifiedAt: row.hours_verified_at?.toISOString() ?? null,
    openNow,
    nextOpenAt: nextOpenAt?.toISOString() ?? null,
    liveIsOpenNow: row.is_open_now,
    closedPermanently: row.closed_permanently ?? false,
    liveCheckedAt: row.live_checked_at?.toISOString() ?? null,
  };

  if (options.tripId === undefined) return result;
  const lodging = await resolveTripLodging(tx, options.tripId);
  if (lodging === undefined) return result;

  const provider = options.routeEtaProvider ?? straightLineEtaProvider;
  const eta = await provider.eta({
    originLat: lodging.lat,
    originLng: lodging.lng,
    destLat: row.lat,
    destLng: row.lng,
    mode: 'pedestrian',
  });
  return {
    ...result,
    distanceFromLodgingM: eta.distanceM,
    etaFromLodgingMinutes: eta.minutes,
    etaFromLodgingIsEstimate: eta.estimate,
  };
}
