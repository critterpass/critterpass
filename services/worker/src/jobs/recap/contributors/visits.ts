/**
 * The visits contributor: the places each traveller's phone detected them at (opt-in visit
 * detection; the table expires with the trip, the outcomes live on in the awards). Per traveller:
 * how many places they went to and the place they went back to most; per day: places visited; per
 * before-sunrise stop: how many travellers really were there that day.
 */
import type pg from 'pg';

import { addDayScore, addDetail, addMetric, type RecapContributor, type RecapScope } from './types';

interface VisitRow {
  readonly user_id: string;
  readonly poi_id: string;
  readonly poi_name: string;
  readonly local_date: string;
}

async function loadVisits(tx: pg.PoolClient, scope: RecapScope): Promise<VisitRow[]> {
  const { rows } = await tx.query<VisitRow>(
    `SELECT v.user_id, v.poi_id, p.name AS poi_name,
            (v.arrived_at AT TIME ZONE $3)::date::text AS local_date
       FROM visits v JOIN pois p ON p.id = v.poi_id
      WHERE v.trip_id = $1 AND v.user_id = ANY($2::uuid[])
        AND (v.arrived_at AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
      ORDER BY v.arrived_at, v.id`,
    [scope.trip.id, scope.members, scope.trip.tz, scope.trip.startDate, scope.trip.endedOn],
  );
  return rows;
}

export const visitsContributor: RecapContributor = {
  name: 'visits',
  async contribute(tx, scope, draft) {
    const visits = await loadVisits(tx, scope);
    const places = new Map<string, Set<string>>();
    const perPlace = new Map<string, Map<string, { name: string; visits: number }>>();
    const dayPlaces = new Set<string>();
    for (const visit of visits) {
      const mine = places.get(visit.user_id) ?? new Set<string>();
      mine.add(visit.poi_id);
      places.set(visit.user_id, mine);
      const counts =
        perPlace.get(visit.user_id) ?? new Map<string, { name: string; visits: number }>();
      const place = counts.get(visit.poi_id) ?? { name: visit.poi_name, visits: 0 };
      counts.set(visit.poi_id, { ...place, visits: place.visits + 1 });
      perPlace.set(visit.user_id, counts);
      const key = `${visit.user_id}|${visit.poi_id}|${visit.local_date}`;
      if (!dayPlaces.has(key)) {
        dayPlaces.add(key);
        addDayScore(draft, visit.local_date, 1);
      }
    }
    for (const [userId, mine] of places) addMetric(draft, userId, 'places_visited', mine.size);
    for (const [userId, counts] of perPlace) {
      const [poiId, top] = [...counts.entries()].sort(
        ([a, x], [b, y]) => y.visits - x.visits || (a < b ? -1 : 1),
      )[0] as [string, { name: string; visits: number }];
      addMetric(draft, userId, 'revisits', top.visits);
      addDetail(draft, userId, { poi_id: poiId, poi_name: top.name });
    }
    draft.superlatives = draft.superlatives.map((superlative) => ({
      ...superlative,
      visited_by: new Set(
        visits
          .filter((v) => v.poi_id === superlative.poi_id && v.local_date === superlative.local_date)
          .map((v) => v.user_id),
      ).size,
    }));
  },
};
