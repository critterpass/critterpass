/**
 * The guide's `route_eta` tool ("how long from the villa to Tirta Empul?") on planning travel:
 * Valhalla minutes, or straight-line "about" minutes when it can't answer, never Mapbox (a guide
 * answer is kept in the chat, and Navigation API results may not be stored). Car and ride minutes
 * carry the destination's drive factor; there is no live traffic (`traffic: false`). With several
 * origins the slowest one answers, so the guide never promises an arrival someone can't make.
 * Transit has no router here: its minutes are the straight-line walk + wait + ride estimate.
 */
import type { ToolRegistry } from '@cp/ai';
import { withSystem } from '@cp/db';
import { estimateStraightLineEta } from '@cp/domain';
import type { PlanningTravel, ValhallaPoint } from '@cp/suppliers';
import type pg from 'pg';

type RouteEtaMode = 'walk' | 'drive' | 'ride' | 'transit' | 'bike';

/** A steady city ride: 15 km/h over the walking route. */
const BIKE_METERS_PER_MINUTE = 250;

export interface RouteEtaAnswer {
  readonly minutes: number;
  readonly distance_m: number;
  readonly traffic: false;
}

async function driveFactor(pool: pg.Pool, tripId: string | null): Promise<number> {
  if (tripId === null) return 1;
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ drive_factor: number | null }>(
      `SELECT d.drive_factor FROM trips t JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1`,
      [tripId],
    ),
  );
  return rows[0]?.drive_factor ?? 1;
}

async function oneOrigin(
  travel: PlanningTravel,
  origin: ValhallaPoint,
  dest: ValhallaPoint,
  mode: RouteEtaMode,
  factor: number,
): Promise<RouteEtaAnswer> {
  if (mode === 'transit') {
    const eta = estimateStraightLineEta({
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      mode: 'multimodal',
    });
    return { minutes: eta.minutes, distance_m: eta.distanceM, traffic: false };
  }
  if (mode === 'walk' || mode === 'bike') {
    const walk = await travel.travel(origin, dest, 'walk');
    const minutes =
      mode === 'walk'
        ? walk.minutes
        : Math.max(1, Math.round(walk.meters / BIKE_METERS_PER_MINUTE));
    return { minutes: walk.meters === 0 ? 0 : minutes, distance_m: walk.meters, traffic: false };
  }
  const drive = await travel.travel(origin, dest, 'drive');
  const minutes = drive.minutes === 0 ? 0 : Math.max(1, Math.round(drive.minutes * factor));
  return { minutes, distance_m: drive.meters, traffic: false };
}

export function registerRouteEtaExecutor(
  registry: ToolRegistry,
  pool: pg.Pool,
  travel: PlanningTravel,
): void {
  registry.registerToolExecutor('route_eta', async (input, context) => {
    const factor =
      input.mode === 'drive' || input.mode === 'ride' ? await driveFactor(pool, context.tripId) : 1;
    const answers = await Promise.all(
      input.origins.map((origin) => oneOrigin(travel, origin, input.dest, input.mode, factor)),
    );
    const slowest = answers.reduce<RouteEtaAnswer | undefined>(
      (worst, answer) => (worst === undefined || answer.minutes > worst.minutes ? answer : worst),
      undefined,
    );
    return slowest ?? { minutes: 0, distance_m: 0, traffic: false };
  });
}
