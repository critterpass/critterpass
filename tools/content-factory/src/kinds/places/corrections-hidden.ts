/**
 * The release items that hide a record: its live item restated with `hide`, without the must-see
 * flags. A record is hidden only where it cannot be merged (nothing in the catalogue sits at the
 * place it names) and no trip points at it; publishing checks the second again.
 */
import { poiItemSchema, type ContentItem } from '@cp/content';

import {
  correctionItems,
  correctionRefs,
  type BeforeRow,
  type CorrectionsFile,
} from './corrections';

type Hidden = CorrectionsFile['hidden'][number];

export function hiddenItems(
  hidden: readonly Hidden[],
  before: readonly BeforeRow[],
  corrected: ReadonlySet<string>,
): ContentItem<'places'>[] {
  const rows = new Map(before.map((row) => [row.ref, row]));
  const seen = new Set<string>();
  return hidden.map(({ ref, destination }) => {
    const row = rows.get(ref);
    if (row === undefined) throw new Error(`${ref} is not in the snapshot`);
    if (row.destination !== destination) {
      throw new Error(`${ref} is in ${row.destination}, not ${destination}`);
    }
    if (corrected.has(ref) || seen.has(ref)) throw new Error(`${ref} is corrected twice`);
    seen.add(ref);
    if (row.item === null) throw new Error(`${ref} (${row.name}) has no live item to restate`);
    if (row.trip_refs > 0) {
      throw new Error(
        `${ref} (${row.name}) is in ${row.trip_refs} trip stops, ideas or must-dos: merge it or decide first`,
      );
    }
    const { must_see: _flag, essential: _tier, ...editorial } = row.item.editorial;
    void _flag;
    void _tier;
    return poiItemSchema.parse({
      ...row.item,
      editorial,
      merge_into: null,
      possible_duplicate_of: null,
      hide: true,
    });
  });
}

/** Every item of a corrections batch: the corrected places, then the hidden records. */
export function batchItems(
  file: Pick<CorrectionsFile, 'places' | 'hidden'>,
  before: readonly BeforeRow[],
): ContentItem<'places'>[] {
  const corrected = new Set(correctionRefs({ places: file.places, hidden: [] }));
  return [...correctionItems(file.places, before), ...hiddenItems(file.hidden, before, corrected)];
}
