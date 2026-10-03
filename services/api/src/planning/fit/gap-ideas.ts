/**
 * Ideas for one free window: the crew's own ideas (with whose save it was and who voted for it,
 * a swipe yes or a "want it"), then curated places near where the free people are, then pairs
 * and going back to the stay. The window is the free window holding the requested start.
 */
import { DomainError, type GapIdeasResult } from '@cp/domain';
import {
  dayGaps,
  gapIdeas,
  layeredTravel,
  legKey,
  straightLineTravel,
  type GapCandidate,
} from '@cp/planner';
import type pg from 'pg';

import { loadFitContext, straightLineSource, tripFitFacts, type LegPair } from './context';
import type { FitDeps } from './service';
import { readFitPlaces } from './signals/visit';

const CURATED_NEAR = 12;

const minuteOf = (clock: string) => {
  const [hour = 0, minute = 0] = clock.split(':').map(Number);
  return hour * 60 + minute;
};

async function candidatePlaces(
  tx: pg.PoolClient,
  tripId: string,
  destinationId: string | null,
  near: { readonly lat: number; readonly lng: number } | null,
) {
  const ideas = await tx.query<{ poi_id: string; created_by: string | null; voted: string[] }>(
    `SELECT i.poi_id, i.created_by,
            array(SELECT DISTINCT u FROM (
              SELECT v.user_id AS u FROM swipe_yes_votes v WHERE v.trip_id = i.trip_id AND v.poi_id = i.poi_id
              UNION SELECT s.user_id FROM place_stances s
               WHERE s.trip_id = i.trip_id AND s.poi_id = i.poi_id AND s.stance = 'want') voters
             ORDER BY u)::text[] AS voted
       FROM trip_ideas i
      WHERE i.trip_id = $1 AND i.deleted_at IS NULL AND i.poi_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = i.poi_id AND h.user_id = app.uid())`,
    [tripId],
  );
  const curated =
    destinationId === null || near === null
      ? []
      : (
          await tx.query<{ id: string }>(
            `SELECT p.id FROM pois p
              WHERE p.destination_id = $1 AND p.status = 'active' AND p.curation = 'editorial'
                AND p.merged_into_id IS NULL AND p.category NOT IN ('stay', 'transit')
                AND NOT EXISTS (SELECT 1 FROM trip_ideas i
                                 WHERE i.trip_id = $4 AND i.poi_id = p.id AND i.deleted_at IS NULL)
                AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = p.id AND h.user_id = app.uid())
              ORDER BY power(p.lat - $2, 2) + power((p.lng - $3) * cos(radians($2)), 2)
              LIMIT $5`,
            [destinationId, near.lat, near.lng, tripId, CURATED_NEAR],
          )
        ).rows;
  return { ideas: ideas.rows, curated: curated.map((row) => row.id) };
}

export async function ideasForGap(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly dayId: string;
    readonly start: string;
    readonly end: string;
  },
  deps: FitDeps,
): Promise<GapIdeasResult> {
  const trip = await tripFitFacts(tx, input.tripId, input.dayId);
  const loaded = await loadFitContext(tx, trip, { stays: deps.stays, now: deps.now() });
  const day = loaded.context.days.find((entry) => entry.dayId === input.dayId);
  if (day === undefined) throw new DomainError('NOT_FOUND', { reason: 'day' });
  const straight = straightLineTravel(loaded.context.driveFactor, loaded.thresholds.walkMaxM);
  const first = { ...loaded.context, travel: layeredTravel(loaded.storedLegs, straight) };
  const start = minuteOf(input.start);
  const holding = dayGaps(first, day).filter((gap) => gap.fromMin <= start && start < gap.toMin);
  const entry =
    holding.find((gap) => gap.fromMin === start && gap.gap.to === input.end) ??
    holding.find((gap) => gap.fromMin === start) ??
    holding.sort((a, b) => b.gap.who_free.length - a.gap.who_free.length)[0];
  if (entry === undefined) throw new DomainError('NOT_FOUND', { reason: 'gap' });
  const near = entry.prev?.point ?? day.stay;
  const pool = await candidatePlaces(tx, trip.id, trip.destinationId, near ?? loaded.anchor);
  const ideaIds = pool.ideas.map((row) => row.poi_id);
  const facts = await readFitPlaces(tx, trip.id, [...ideaIds, ...pool.curated], loaded.inPlan);
  const byId = new Map(pool.ideas.map((row) => [row.poi_id, row]));
  const candidates: GapCandidate[] = facts
    .filter(({ place }) => !loaded.inPlan.has(place.poiId))
    .map(({ place }) => {
      const idea = byId.get(place.poiId);
      return {
        place,
        source: idea === undefined ? 'curated' : 'idea',
        costEachMinor: null,
        currency: null,
        saverId: idea?.created_by ?? null,
        votedBy: idea?.voted ?? [],
      };
    });
  const from = near === null ? null : { key: entry.prev?.stableId ?? 'stay', ...near };
  const nextPoint = entry.next?.point ?? null;
  const pairs: LegPair[] = candidates.flatMap(({ place }) => {
    const here = { key: place.poiId, ...place.point };
    return [
      ...(from === null ? [] : [{ from, to: here }]),
      ...(entry.next === null || nextPoint === null
        ? []
        : [{ from: here, to: { key: entry.next.stableId, ...nextPoint } }]),
    ];
  });
  const source = (deps.travel ?? straightLineSource)(
    loaded.context.driveFactor,
    loaded.thresholds.walkMaxM,
  );
  const routed = await source.legs(
    pairs.filter((pair) => !loaded.storedLegs.has(legKey(pair.from.key, pair.to.key))),
  );
  const context = {
    ...loaded.context,
    travel: layeredTravel(new Map([...loaded.storedLegs, ...routed]), straight),
  };
  return {
    who_free: entry.gap.who_free,
    context: { busy: entry.gap.busy, next_item: entry.gap.next_item },
    ideas: gapIdeas(context, entry, candidates),
  };
}
