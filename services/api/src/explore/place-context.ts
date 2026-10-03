/**
 * `GET /v1/places/{id}/context?trip_id&date` (docs/api-contracts-explore.md): what a place page
 * adds when opened from a trip. How far it is from the stay, its quiet window on the date, who in
 * the crew saved it or swiped yes, the crew's Q&A line (this trip's chat only), whether it is in
 * the plan already and, if not, the suggested ADD TO DAY slot and how adding goes (the organiser
 * applies, a member proposes a change). Supplier offers stay on their own uncached route.
 */
import { sendInTx, withUser } from '@cp/db';
import {
  DomainError,
  EXPLORE_QUEUES,
  knownHours,
  straightLineEtaProvider,
  toLocalWallTime,
  type BestWindow,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import { asSystemRole } from '../admin/command';
import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { readCrowds } from '../travel-data/crowds-route';
import { loadSlotDays, placeFacts, type TripFacts } from './plan-read';
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
}

async function tripFacts(tx: pg.PoolClient, tripId: string): Promise<TripFacts> {
  const { rows } = await tx.query<TripFacts>(
    `SELECT t.id, coalesce(t.tz, d.tz) AS tz, t.destination_id, t.current_version_id,
            t.start_date::text AS start_date, app.is_trip_organiser(t.id) AS organiser
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND app.is_trip_member(t.id)`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return trip;
}

/** Crewmates on the trip who saved this place: derived, only for a place in the trip's destination. */
async function savedBy(tx: pg.PoolClient, trip: TripFacts, poiId: string): Promise<string[]> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ user_id: string }>(
      `SELECT s.user_id FROM saved_items s
         JOIN trip_participants p ON p.user_id = s.user_id AND p.trip_id = $1
         JOIN pois ON pois.id = s.ref_id AND pois.destination_id = $3
        WHERE s.kind = 'poi' AND s.ref_id = $2 AND p.rsvp IS DISTINCT FROM 'out'
        ORDER BY s.created_at, s.user_id`,
      [trip.id, poiId, trip.destination_id],
    ),
  );
  return rows.map((row) => row.user_id);
}

/** The trip's Q&A line, and a refresh queued when its chat named the place since. */
async function qnaLine(tx: pg.PoolClient, tripId: string, poiId: string, name: string) {
  const { rows } = await tx.query<{ text: string; source_at: Date; updated_at: Date }>(
    'SELECT text, source_at, updated_at FROM place_qna_summaries WHERE trip_id = $1 AND poi_id = $2',
    [tripId, poiId],
  );
  const line = rows[0];
  const latest = await tx.query<{ at: Date | null }>(
    `SELECT max(created_at) AS at FROM messages
      WHERE trip_id = $1 AND sender_kind = 'user' AND type = 'text' AND deleted_at IS NULL
        AND ((ref_kind = 'poi' AND ref_id = $2) OR strpos(lower(body), lower($3)) > 0)`,
    [tripId, poiId, name],
  );
  const at = latest.rows[0]?.at ?? null;
  if (at !== null && (line === undefined || at > line.source_at)) {
    await sendInTx(
      tx,
      EXPLORE_QUEUES.placeQna,
      { trip_id: tripId, poi_id: poiId },
      {
        singletonKey: `${tripId}:${poiId}`,
      },
    );
  }
  return line === undefined
    ? null
    : {
        text: line.text,
        source_at: line.source_at.toISOString(),
        updated_at: line.updated_at.toISOString(),
      };
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
