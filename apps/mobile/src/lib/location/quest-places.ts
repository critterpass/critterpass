/**
 * The places today's open quests name, watched whether or not they are on the plan: a crew quest
 * to check in somewhere completes only if the phone notices the visit, and a stop taken off the
 * plan (or a place that was never on it) is otherwise invisible to the geofences and the visit
 * detector. Each place's point comes from the phone's `pois` table; a place the phone has no copy
 * of is fetched once from `GET /v1/places/{id}` and kept for the day. Offline with no copy, the
 * place is skipped until a fetch succeeds.
 */
import { questPlaceRefs, toLocalWallTime, type PlanPoi } from '@cp/domain';

import {
  toVisitCandidate,
  type DayPlan,
  type PlanPoiRow,
  type VisitCandidate,
} from './bridge-inputs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const quoted = (ids: readonly string[]) =>
  ids
    .filter((id) => UUID.test(id))
    .map((id) => `'${id}'`)
    .join(', ');

export interface QuestRow {
  readonly id: string;
  readonly params: unknown;
  readonly local_date: string;
  readonly ends_at: string;
}

export const QUEST_TABLES = ['quests'] as const;

export function questSql(tripId: string): string {
  if (!UUID.test(tripId)) throw new Error(`not a uuid: ${tripId}`);
  return `SELECT id, params, local_date, ends_at FROM quests
    WHERE trip_id = '${tripId}' AND status IN ('offered', 'active')`;
}

export interface QuestPlaceRefs {
  readonly poiIds: readonly string[];
  readonly planItemIds: readonly string[];
}

/** Places named by today's quests that are still open (not done, failed or past their deadline). */
export function openQuestPlaces(
  rows: readonly QuestRow[],
  now: number,
  tz: string,
): QuestPlaceRefs {
  const today = toLocalWallTime(new Date(now), tz).date;
  const poiIds = new Set<string>();
  const planItemIds = new Set<string>();
  for (const row of rows) {
    if (row.local_date !== today || Date.parse(row.ends_at) <= now) continue;
    const refs = questPlaceRefs(row.params);
    refs.poiIds.forEach((id) => poiIds.add(id));
    refs.planItemIds.forEach((id) => planItemIds.add(id));
  }
  return { poiIds: [...poiIds].sort(), planItemIds: [...planItemIds].sort() };
}

export const QUEST_ITEM_TABLES = ['plan_items'] as const;

/** The POI behind each plan item a quest names (any version: the item may be off the plan now). */
export function questItemSql(planItemIds: readonly string[]): string | null {
  const ids = quoted(planItemIds);
  return ids === ''
    ? null
    : `SELECT DISTINCT poi_id FROM plan_items WHERE stable_id IN (${ids}) AND poi_id IS NOT NULL`;
}

export const QUEST_POI_TABLES = ['pois'] as const;

export function questPoiSql(poiIds: readonly string[]): string | null {
  const ids = quoted(poiIds);
  return ids === ''
    ? null
    : `SELECT id, lat, lng, visit_radius_m AS radius, category, NULL AS starts_at
        FROM pois WHERE id IN (${ids})`;
}

/** A place's point as `GET /v1/places/{id}` answers it. */
export interface FetchedPlace {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly category: string;
}

export type PlaceFetcher = (poiId: string) => Promise<FetchedPlace | null>;

/** A failed fetch (offline, server error) is retried after this long. */
export const QUEST_PLACE_RETRY_MS = 5 * 60_000;

export interface QuestPlaceStore {
  /** Each id's local row, else the copy fetched today; ids with neither are left out. */
  resolve(ids: readonly string[], local: readonly PlanPoiRow[], day: string): PlanPoiRow[];
  /** Fetches the ids with no local row and no copy for the day; true when a copy landed. */
  fill(ids: readonly string[], local: readonly PlanPoiRow[], day: string): Promise<boolean>;
}

export function createQuestPlaceStore(
  fetchPlace: PlaceFetcher,
  now: () => number = Date.now,
): QuestPlaceStore {
  let day = '';
  const copies = new Map<string, PlanPoiRow>();
  const failedAt = new Map<string, number>();
  const pending = new Set<string>();
  const turn = (next: string) => {
    if (next === day) return;
    day = next;
    copies.clear();
    failedAt.clear();
  };
  const missing = (ids: readonly string[], local: readonly PlanPoiRow[]) => {
    const have = new Set(local.map((row) => row.id));
    return ids.filter((id) => !have.has(id));
  };
  return {
    resolve(ids, local, today) {
      turn(today);
      const byId = new Map(local.map((row) => [row.id, row]));
      return ids.flatMap((id) => {
        const row = byId.get(id) ?? copies.get(id);
        return row === undefined ? [] : [row];
      });
    },
    async fill(ids, local, today) {
      turn(today);
      const due = missing(ids, local).filter((id) => {
        const failed = failedAt.get(id);
        return (
          !copies.has(id) &&
          !pending.has(id) &&
          (failed === undefined || now() - failed >= QUEST_PLACE_RETRY_MS)
        );
      });
      const landed = await Promise.all(
        due.map(async (id) => {
          pending.add(id);
          try {
            const place = await fetchPlace(id);
            if (place === null || today !== day) return false;
            copies.set(id, { ...place, id, radius: null, starts_at: null });
            failedAt.delete(id);
            return true;
          } catch {
            failedAt.set(id, now());
            return false;
          } finally {
            pending.delete(id);
          }
        }),
      );
      return landed.some(Boolean);
    },
  };
}

/** The day plan with the quest places added: their own geofence source and visit candidates. */
export function withQuestPlaces(plan: DayPlan, rows: readonly PlanPoiRow[]): DayPlan {
  if (rows.length === 0) return plan;
  const questPois: VisitCandidate[] = rows.map(toVisitCandidate);
  const known = new Set(plan.candidates.map((candidate) => candidate.id));
  return {
    context: { ...plan.context, questPois: questPois satisfies readonly PlanPoi[] },
    candidates: [...plan.candidates, ...questPois.filter((poi) => !known.has(poi.id))],
  };
}
