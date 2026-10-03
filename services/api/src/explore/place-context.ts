/**
 * `GET /v1/places/{id}/context?trip_id&date` (docs/api-contracts-explore.md, with the planning
 * delta in docs/api-contracts-planning.md): what a place page adds when opened from a trip. How far
 * it is from the stay, its quiet window on the date, who in the crew saved it or swiped yes, the
 * crew's Q&A line (this trip's chat only), whether it is in the plan already and, if not, the
 * suggested ADD TO DAY slot and how adding goes (the organiser applies, a member proposes a
 * change). The planning page adds when it fits (the fit engine), its fact tiles (our own hours and
 * approved editorial facts only), what is nearby and similar, and where the crew stands on it.
 * Supplier offers and live third-party details stay on their own routes and never land here.
 */
import { withUser } from '@cp/db';
import {
  DomainError,
  knownHours,
  straightLineEtaProvider,
  toLocalWallTime,
  type BestWindow,
} from '@cp/domain';
import { straightLineTravel } from '@cp/planner';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { readFitThresholds, straightLineSource, tripFitFacts } from '../planning/fit/context';
import { nearbyPlaces, type NearbyPlace } from '../planning/fit/nearby';
import { readSplitSummary, type SplitSummary } from '../planning/split/stances';
import { tripStay } from '../planning/stay';
import { readCrowds } from '../travel-data/crowds-route';
import {
  editorialExtras,
  factTiles,
  SIMILAR_MIN_MINUTES,
  whenItFits,
  type PlaceFactTiles,
  type WhenItFits,
} from './place-fit';
import {
  loadSlotDays,
  placeFacts,
  qnaLine,
  savedBy,
  similarPlaces,
  tripFacts,
  type PlaceFacts,
  type SimilarPlace,
  type TripFacts,
} from './plan-read';
import { DEFAULT_VISIT_MIN, suggestSlot, type SuggestedSlot } from './slot-suggest';

export interface PlaceContext {
  readonly poi_id: string;
  readonly trip_id: string;
  readonly stay: {
    readonly distance_m: number;
    readonly minutes: number;
    readonly estimate: boolean;
  } | null;
  readonly crowd: { readonly date: string; readonly best_window: BestWindow | null } | null;
  readonly crew: { readonly saved_by: readonly string[]; readonly yes_by: readonly string[] };
  readonly qna: {
    readonly text: string;
    readonly source_at: string;
    readonly updated_at: string;
  } | null;
  readonly in_plan: {
    readonly day_no: number;
    readonly stable_id: string;
    readonly starts_at: string | null;
  } | null;
  readonly suggested_slot: SuggestedSlot | null;
  readonly add_mode: 'apply' | 'changeset';
  readonly base_version: string | null;
  /** Drive or walk minutes from the night's stay, by the planning travel estimate. */
  readonly from_stay: {
    readonly name: string;
    readonly minutes: number;
    readonly mode: 'walk' | 'drive';
    readonly approx: boolean;
  } | null;
  readonly when_it_fits: WhenItFits | null;
  readonly facts: PlaceFactTiles;
  readonly tip: string | null;
  readonly know: readonly { readonly title: string; readonly detail?: string | undefined }[];
  readonly nearby: readonly NearbyPlace[];
  readonly similar: readonly SimilarPlace[];
  /** A published crew plan's line about the place; null until community plans exist. */
  readonly quote: null;
  readonly split: SplitSummary | null;
}

export async function readPlaceContext(
  tx: pg.PoolClient,
  input: { readonly poiId: string; readonly tripId: string; readonly date?: string | undefined },
): Promise<PlaceContext> {
  const trip = await tripFacts(tx, input.tripId);
  const place = await placeFacts(tx, input.poiId);
  const tz = trip.tz ?? place.tz ?? 'UTC';
  const plan = await loadSlotDays(tx, trip, input.poiId, tz);
  const date = input.date ?? plan.firstDate ?? toLocalWallTime(new Date(), tz).date;
  const crowd = await readCrowds(tx, input.poiId, date);
  const stay =
    plan.stay === null
      ? null
      : await straightLineEtaProvider
          .eta({
            originLat: plan.stay.lat,
            originLng: plan.stay.lng,
            destLat: place.lat,
            destLng: place.lng,
            mode: 'pedestrian',
          })
          .then((eta) => ({
            distance_m: Math.round(eta.distanceM),
            minutes: eta.minutes,
            estimate: eta.estimate,
          }));
  const yes = await tx.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM swipe_yes_votes WHERE trip_id = $1 AND poi_id = $2 ORDER BY user_id`,
    [trip.id, input.poiId],
  );
  const planning = await planningExtras(tx, { trip, place, poiId: input.poiId, date });
  // Installed builds read this field: it keeps the slot finder's answer, unchanged; the planning
  // page reads `when_it_fits` instead.
  const suggested =
    plan.inPlan !== null
      ? null
      : suggestSlot({
          days: plan.days,
          tz,
          hours: knownHours(place.hours),
          quietStart: crowd.best_window?.start ?? null,
          durationMin: place.timeNeededMin ?? DEFAULT_VISIT_MIN,
        });
  return {
    poi_id: input.poiId,
    trip_id: trip.id,
    stay,
    crowd: crowd.hourly === null ? null : { date, best_window: crowd.best_window },
    crew: {
      saved_by: await savedBy(tx, trip, input.poiId),
      yes_by: yes.rows.map((r) => r.user_id),
    },
    qna: await qnaLine(tx, trip.id, input.poiId, place.name),
    in_plan: plan.inPlan,
    suggested_slot: suggested,
    add_mode: trip.organiser ? 'apply' : 'changeset',
    base_version: trip.current_version_id,
    ...planning,
  };
}

type PlanningExtras = Pick<
  PlaceContext,
  'from_stay' | 'when_it_fits' | 'facts' | 'tip' | 'know' | 'nearby' | 'similar' | 'quote' | 'split'
>;

/** The planning page's additions; a member who is out of the trip gets the facts only. */
async function planningExtras(
  tx: pg.PoolClient,
  input: { trip: TripFacts; place: PlaceFacts; poiId: string; date: string },
): Promise<PlanningExtras> {
  const { trip, place, poiId } = input;
  const base = {
    from_stay: null,
    when_it_fits: null,
    facts: factTiles(place, input.date),
    ...editorialExtras(place),
    nearby: [],
    similar: [],
    quote: null,
    split: await readSplitSummary(tx, trip.id, poiId),
  } satisfies PlanningExtras;
  const fitTrip = await tripFitFacts(tx, trip.id).catch((error: unknown) => {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (fitTrip === null) return base;
  const fits = await whenItFits(tx, { tripId: trip.id, poiId, hours: place.hours });
  const date = fits?.best?.date ?? input.date;
  const { walkMaxM } = await readFitThresholds(tx);
  const travel = straightLineTravel(fitTrip.driveFactor, walkMaxM);
  const here = { key: poiId, lat: place.lat, lng: place.lng };
  const stay = await tripStay(tx, trip.id, date, fitTrip.versionId ?? undefined);
  const fromStay =
    stay === null ? null : travel({ key: 'stay', lat: stay.lat, lng: stay.lng }, here);
  const similar = (
    await similarPlaces(tx, { destinationId: trip.destination_id, poiId, place })
  ).flatMap((row) => {
    const leg = travel(here, { key: row.poi_id, lat: row.lat, lng: row.lng });
    return leg === null || leg.minutes < SIMILAR_MIN_MINUTES
      ? []
      : [{ poi_id: row.poi_id, name: row.name, category: row.category, minutes: leg.minutes }];
  });
  return {
    ...base,
    from_stay: stay === null || fromStay === null ? null : { name: stay.name, ...fromStay },
    when_it_fits: fits,
    facts: factTiles(place, date),
    nearby: await nearbyPlaces(
      tx,
      { destinationId: trip.destination_id, poiId, limit: 3 },
      straightLineSource(fitTrip.driveFactor, walkMaxM),
    ),
    similar: similar.slice(0, 3),
  };
}

const querySchema = z.object({ trip_id: z.uuid(), date: z.iso.date().optional() });

export function registerPlaceContextRoute(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  app.get('/v1/places/:id/context', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = querySchema.parse(c.req.query());
    const poiId = z.uuid().parse(c.req.param('id'));
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readPlaceContext(tx, { poiId, tripId: query.trip_id, date: query.date }),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
