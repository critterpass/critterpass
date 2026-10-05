/** What a destination's corrections come to, for the review page and the report. */
import { metresBetween, type BeforeRow, type PlaceCorrection } from './corrections';

export interface CorrectionCounts {
  readonly places: number;
  readonly merges: number;
  /** Recommended records folded into another record. */
  readonly recommendedMerges: number;
  readonly kindChanges: number;
  readonly renames: number;
  /** Places that had a recommended record over 2 km from the kept one. */
  readonly movedPoints: number;
  readonly mustSees: number;
  readonly essentials: number;
  /** Records that join the recommended set. */
  readonly added: number;
}

export const FAR_M = 2_000;

/** What a destination's corrections come to, for the review page and the report. */
export function correctionCounts(
  places: readonly PlaceCorrection[],
  before: readonly BeforeRow[],
): CorrectionCounts {
  const rows = new Map(before.map((row) => [row.ref, row]));
  const at = (ref: string) => {
    const found = rows.get(ref);
    if (found === undefined) throw new Error(`${ref} is not in the snapshot`);
    return found;
  };
  let merges = 0;
  let recommendedMerges = 0;
  let kindChanges = 0;
  let renames = 0;
  let movedPoints = 0;
  let mustSees = 0;
  let essentials = 0;
  let added = 0;
  for (const place of places) {
    const kept = at(place.keep);
    // A record restated only to carry a new note already redirects to the kept one: not counted.
    const duplicates = place.merge
      .map((m) => at(m.ref))
      .filter((d) => d.merged_into !== place.keep);
    merges += duplicates.length;
    recommendedMerges += duplicates.filter((d) => d.curated && d.merged_into === null).length;
    if (place.stated && place.category !== undefined && place.category !== kept.category) {
      kindChanges += 1;
    }
    if (place.stated && place.name !== undefined && place.name !== kept.name) renames += 1;
    if (duplicates.some((d) => d.curated && metresBetween(d, kept) > FAR_M)) movedPoints += 1;
    if (place.must_see === true) mustSees += 1;
    if (place.essential === true) essentials += 1;
    if (place.stated && !kept.curated) added += 1;
  }
  return {
    places: places.length,
    merges,
    recommendedMerges,
    kindChanges,
    renames,
    movedPoints,
    mustSees,
    essentials,
    added,
  };
}
