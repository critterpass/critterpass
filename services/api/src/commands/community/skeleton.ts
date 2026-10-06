/**
 * The plan skeleton a crew publishes from (read as the system, after the caller's access was
 * checked): destination, dates, first names, the current plan's days and places, the per-person
 * cost, album picks cleared for faces and the crew's own approved tips.
 *
 * Photos fail closed: only a pick whose on-device face count is known to be zero is shared, so a
 * face can never reach another crew unblurred.
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { MAX_SHARED_PHOTOS, type PlanSkeleton } from '@cp/domain';
import type pg from 'pg';

export interface TripForSharing {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly version_id: string | null;
  readonly status: string;
}

export async function tripForSharing(
  tx: pg.PoolClient,
  tripId: string,
): Promise<TripForSharing | null> {
  const { rows } = await tx.query<TripForSharing>(
    `SELECT t.id AS trip_id, t.crew_id, t.destination_id, d.name AS destination_name,
            to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(t.end_date, 'YYYY-MM-DD') AS end_date,
            t.current_version_id AS version_id, t.status
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] ?? null;
}

/** Everyone holding a seat on the trip: the people whose consent a publish needs. */
export async function seatHolders(
  tx: pg.PoolClient,
  tripId: string,
): Promise<{ user_id: string; first_name: string }[]> {
  const { rows } = await tx.query<{ user_id: string; first_name: string }>(
    `SELECT p.user_id,
            coalesce(nullif(split_part(trim(u.display_name), ' ', 1), ''), 'Traveller') AS first_name
       FROM trip_participants p JOIN users u ON u.id = p.user_id
      WHERE p.trip_id = $1 AND p.holds_seat
      ORDER BY (p.role = 'organiser') DESC, p.created_at, p.user_id`,
    [tripId],
  );
  return rows;
}

async function planDays(tx: pg.PoolClient, versionId: string | null) {
  if (versionId === null) return [];
  const { rows } = await tx.query<{
    day_no: number;
    theme: string | null;
    places: { poi_id: string; name: string; category: string | null }[] | null;
  }>(
    `SELECT d.day_no, d.theme,
            (SELECT jsonb_agg(jsonb_build_object('poi_id', p.id, 'name', p.name,
                                                 'category', p.category)
                              ORDER BY i.starts_at NULLS LAST, i.created_at)
               FROM plan_items i JOIN pois p ON p.id = i.poi_id
              WHERE i.day_id = d.id AND i.poi_id IS NOT NULL) AS places
       FROM plan_days d
      WHERE d.version_id = $1
      ORDER BY d.day_no`,
    [versionId],
  );
  return rows.map((row) => ({ day_no: row.day_no, theme: row.theme, places: row.places ?? [] }));
}

async function versionCost(tx: pg.PoolClient, versionId: string | null) {
  if (versionId === null) return { cost: null, currency: null };
  const { rows } = await tx.query<{ cost: string | null; currency: string | null }>(
    'SELECT cost_pp_minor AS cost, currency FROM itinerary_versions WHERE id = $1',
    [versionId],
  );
  const row = rows[0];
  return {
    cost: row?.cost === null || row?.cost === undefined ? null : Number(row.cost),
    currency: row?.currency ?? null,
  };
}

async function clearedPhotoKeys(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ key: string }>(
    `SELECT coalesce(ph.display_key, ph.media_key) AS key
       FROM album_picks a JOIN photos ph ON ph.id = a.photo_id
      WHERE a.trip_id = $1 AND a.picked AND ph.deleted_at IS NULL
        AND ph.upload_state IN ('uploaded', 'processed')
        AND (ph.quality->>'face_count') = '0'
      ORDER BY a.rank NULLS LAST, ph.taken_at NULLS LAST, ph.id
      LIMIT $2`,
    [tripId, MAX_SHARED_PHOTOS],
  );
  return rows.map((row) => row.key);
}

async function crewTips(tx: pg.PoolClient, tripId: string) {
  const { rows } = await tx.query<{ poi_id: string; text: string }>(
    `SELECT r.poi_id, r.tip AS text FROM ratings r
      WHERE r.trip_id = $1 AND r.tip_status = 'approved' AND r.tip IS NOT NULL
      ORDER BY r.created_at LIMIT 20`,
    [tripId],
  );
  return rows;
}

export async function loadPlanSkeleton(
  tx: pg.PoolClient,
  trip: TripForSharing,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<PlanSkeleton | null> {
  if (trip.destination_id === null || trip.version_id === null) return null;
  const [holders, days, cost, photos, tips] = [
    await seatHolders(tx, trip.trip_id),
    await planDays(tx, trip.version_id),
    await versionCost(tx, trip.version_id),
    await clearedPhotoKeys(tx, trip.trip_id),
    await crewTips(tx, trip.trip_id),
  ];
  const currency = cost.currency !== null && isKnownCurrency(cost.currency) ? cost.currency : null;
  return {
    destination_id: trip.destination_id,
    destination_name: trip.destination_name ?? '',
    start_date: trip.start_date,
    end_date: trip.end_date,
    first_names: holders.map((holder) => holder.first_name),
    days,
    cost_pp_minor: currency === null ? null : cost.cost,
    currency,
    currency_exponent: currency === null ? 2 : currencyExponent(currency),
    photo_keys: photos,
    tips,
    travelled:
      ['post_trip', 'archived'].includes(trip.status) ||
      (trip.end_date !== null && trip.end_date < today),
  };
}
