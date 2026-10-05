/**
 * What is mine alone on the crew's plan ("just me"): the stops I skip for myself, the crew's stops
 * I changed for myself, and the stops only I have. Read from my active `personal_plan_ops` rows
 * laid over the crew's plan, so the day plan, the trip map and day-of can draw it: a skipped stop
 * stands back with "You're skipping this", and what only I have says "Only you".
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { PlanState, PlanStateItem } from '@cp/domain';
import { mergeOverlay } from '@cp/planner';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import type { ItemDisplay } from '@/data/plan/plan-model';

import { overlayRows, type PersonalOpsRow } from '../overlay/model/personal-plan';

/** `skipping`: the crew's stop, off my own plan. `only_me`: on my plan in a way only I see. */
export type PersonalMark = 'skipping' | 'only_me';

export interface PersonalLayer {
  /** Crew stops I skip or changed for myself, by stable id. */
  readonly marks: ReadonlyMap<string, PersonalMark>;
  /** Stops only I have, as plan items (their day and times as I set them). */
  readonly added: readonly PlanStateItem[];
}

export const NO_PERSONAL_LAYER: PersonalLayer = { marks: new Map(), added: [] };

export function personalLayer(
  crew: PlanState,
  rows: readonly PersonalOpsRow[],
  uid: string | null,
): PersonalLayer {
  const overlay = overlayRows(rows);
  if (uid === null || !overlay.some((row) => row.status === 'active')) return NO_PERSONAL_LAYER;
  const merged = mergeOverlay(crew, overlay, uid);
  const inCrew = new Set(crew.items.map((item) => item.stable_id));
  const marks = new Map<string, PersonalMark>();
  for (const id of merged.skipped) marks.set(id, 'skipping');
  const added: PlanStateItem[] = [];
  for (const item of merged.items) {
    if (!item.just_you) continue;
    if (inCrew.has(item.stable_id)) {
      marks.set(item.stable_id, 'only_me');
    } else {
      const { just_you: _mine, clash: _clash, ...plain } = item;
      added.push(plain);
    }
  }
  return marks.size === 0 && added.length === 0 ? NO_PERSONAL_LAYER : { marks, added };
}

const ROWS_SQL = `SELECT id, ops, status FROM personal_plan_ops
  WHERE trip_id = ? AND user_id = ? ORDER BY created_at, id`;
const ROWS_TABLES = ['personal_plan_ops'];
const POIS_SQL = `SELECT id, name, lat, lng FROM pois WHERE id IN (
  SELECT json_extract(op.value, '$.after.poi_id') FROM personal_plan_ops p, json_each(p.ops) op
  WHERE p.trip_id = ? AND p.status = 'active')`;
const POIS_TABLES = ['pois', 'personal_plan_ops'];

interface PoiRow {
  readonly id: string;
  readonly name: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** The names and positions of the places only I added, keyed by the stop's stable id. */
export function addedDisplay(
  added: readonly PlanStateItem[],
  pois: readonly PoiRow[],
): Map<string, ItemDisplay> {
  const byId = new Map(pois.map((poi) => [poi.id, poi]));
  return new Map(
    added.map((item) => {
      const poi = item.poi_id == null ? undefined : byId.get(item.poi_id);
      return [
        item.stable_id,
        {
          title: poi?.name ?? null,
          place:
            poi === undefined || poi.lat === null || poi.lng === null
              ? null
              : { lat: poi.lat, lng: poi.lng },
        },
      ];
    }),
  );
}

/** My personal layer over the crew's plan `crew` of trip `tripId`, read live. */
export function usePersonalLayer(
  tripId: string | null,
  uid: string | null,
  crew: PlanState,
): { readonly layer: PersonalLayer; readonly display: ReadonlyMap<string, ItemDisplay> } {
  const rows = useLiveRows<PersonalOpsRow>(
    ROWS_SQL,
    tripId === null || uid === null ? null : [tripId, uid],
    ROWS_TABLES,
  );
  const pois = useLiveRows<PoiRow>(POIS_SQL, tripId === null ? null : [tripId], POIS_TABLES);
  return useMemo(() => {
    const layer = personalLayer(crew, rows.rows, uid);
    return { layer, display: addedDisplay(layer.added, pois.rows) };
  }, [crew, rows.rows, pois.rows, uid]);
}
