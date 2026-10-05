/**
 * A place that is already a stop of the plan: how it is recognised (so it is never added a second
 * time) and whether a choice would leave it exactly where it is.
 */
import type { AddChoice } from './add-model';

/** Where a place already sits in the plan. */
export interface PlacedStop {
  readonly stableId: string;
  readonly dayNo: number;
  readonly startMin: number;
}

/** The choice is exactly where the stop is now: there is nothing to move. */
export function isWhereItIs(choice: AddChoice | null, existing: PlacedStop | null): boolean {
  return (
    choice !== null &&
    existing !== null &&
    choice.dayNo === existing.dayNo &&
    choice.startMin === existing.startMin
  );
}

/** How close two spots are when the catalogue holds one place under two rows. */
const SAME_SPOT_DEG = 0.002;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The plan's stop for a place: the same place id, or (the catalogue sometimes holds one place
 * twice) the same name on the same spot, so a place is never put in the plan a second time.
 */
export function stopOfPlace<
  Row extends {
    readonly stable_id: string;
    readonly poi_id: string | null;
    readonly poi_lat: number | null;
    readonly poi_lng: number | null;
  },
>(
  place: {
    readonly poiId: string | null;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
  },
  rows: readonly Row[],
  titleOf: (stableId: string) => string | null,
): Row | undefined {
  return (
    rows.find((row) => place.poiId !== null && row.poi_id === place.poiId) ??
    rows.find(
      (row) =>
        row.poi_lat !== null &&
        row.poi_lng !== null &&
        Math.abs(row.poi_lat - place.lat) < SAME_SPOT_DEG &&
        Math.abs(row.poi_lng - place.lng) < SAME_SPOT_DEG &&
        sameName(titleOf(row.stable_id) ?? '', place.name),
    )
  );
}
