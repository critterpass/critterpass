/**
 * Records a corrections batch states before the catalogue holds them: a sight in a strip the
 * destination's box has just been widened to, named by the open-data id the ingest stores it
 * under. Publishing creates the record at the stated point when the ingest has not read the strip
 * yet, and corrects the ingested record when it has, so the batch reads the same either way.
 *
 * A new record has to lie where the app can route to it and draw it (`dayTripReach`), like every
 * place the factory makes.
 */
import { poiCategorySchema } from '@cp/domain';
import { z } from 'zod';

import type { BeforeRow } from './corrections';
import { dayTripReach, kmOutside } from './day-trips';

export const newRecordSchema = z
  .object({
    destination: z.string().min(1),
    /** The id the open-data source holds the place under, so the ingest lands on the same row. */
    ref: z.string().regex(/^(fsq_os|overture):[\w.-]+$/u),
    name: z.string().min(1),
    name_local: z.string().min(1).nullable(),
    category: poiCategorySchema,
    lat: z.number(),
    lng: z.number(),
    address: z.string().min(1).nullable(),
  })
  .strict();
export type NewRecord = z.infer<typeof newRecordSchema>;

/**
 * The snapshot with a row for each new record the catalogue does not hold yet (`id` null). A
 * record the snapshot found keeps its stored row: the ingest has created it since.
 */
export function withNewRecords(
  snapshot: readonly BeforeRow[],
  records: readonly NewRecord[],
): BeforeRow[] {
  const stored = new Set(snapshot.map((row) => row.ref));
  const rows = records
    .filter((record) => !stored.has(record.ref))
    .map((record): BeforeRow => ({
      ...record,
      id: null,
      tz: null,
      curated: false,
      must_see: false,
      essential: false,
      merged_into: null,
      item: null,
    }));
  return [...snapshot, ...rows];
}

/** One line per new record beyond its destination's map pack or routing area; none when all fit. */
export function outOfReach(records: readonly NewRecord[]): string[] {
  return records.flatMap((record) => {
    const reach = dayTripReach(record.destination);
    const km = reach === null ? 0 : kmOutside(reach, record);
    return km === 0
      ? []
      : [`${record.name} lies ${km} km outside ${record.destination}'s map pack and routing area`];
  });
}
