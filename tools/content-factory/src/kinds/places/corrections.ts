/**
 * A corrections batch for curated places: hand-made decisions about records the catalogue already
 * holds (which record of a place to keep, which duplicates fold into it, a wrong kind, a name, the
 * must-see flag), turned into release items without a model call.
 *
 * Publishing never moves the point of an existing record, so a place pinned in the wrong spot is
 * corrected by keeping the record that sits at the real place and merging the wrong one into it.
 * A merged record leaves search, suggestions and drafts; it is the only way a release takes a
 * record out of the recommended set.
 *
 * The decisions live in `data/place-corrections/<batch>.json`, beside a snapshot of the records as
 * staging held them (`<batch>.before.json`), so the batch can be rebuilt and reviewed offline.
 */
import path from 'node:path';

import { poiEditorialSchema, poiItemSchema, tasteTagSchema, type ContentItem } from '@cp/content';
import { poiCategorySchema } from '@cp/domain';
import { z } from 'zod';

import { curatedDestinations, placeFacts } from '../../data/place-facts';
import { FACTORY_DIR, readJson } from '../../work';
import { LICENCES } from './pois';

type Poi = ContentItem<'places'>;

const refSchema = z.string().regex(/^(editorial|fsq_os|overture):[\w.-]+$/u);

const noteSchema = poiEditorialSchema
  .omit({ must_see: true })
  .extend({ tags: z.array(tasteTagSchema).min(1).max(4) })
  .strict();

const correctionSchema = z
  .object({
    destination: z.string().min(1),
    /** The record kept for the place. */
    keep: refSchema,
    /** Its name as the catalogue holds it, so a reader of the file knows the record. */
    stored_name: z.string().min(1),
    /**
     * False where the kept record stays outside the recommended set: only its duplicates are
     * stated, since an item always marks its record as curated.
     */
    stated: z.boolean(),
    name: z.string().min(1).optional(),
    name_local: z.string().min(1).nullable().optional(),
    category: poiCategorySchema.optional(),
    must_see: z.boolean().optional(),
    /** The editorial note of a record the recommended set did not hold before. */
    note: noteSchema.optional(),
    why: z.string().min(1),
    /** The map object the kept point was checked against, and how far the point is from it. */
    checked: z
      .object({ source: z.string().min(1), lat: z.number(), lng: z.number(), off_m: z.number() })
      .strict(),
    merge: z.array(z.object({ ref: refSchema, stored_name: z.string().min(1) }).strict()),
  })
  .strict();
export type PlaceCorrection = z.infer<typeof correctionSchema>;

export const correctionsFileSchema = z
  .object({
    batch: z.string().min(1),
    checked_at: z.iso.datetime({ offset: true }),
    places: z.array(correctionSchema).min(1),
    /** Faults found and left as they are, with the reason, for the review page. */
    left_alone: z.array(
      z.object({ destination: z.string().min(1), name: z.string().min(1), why: z.string().min(1) }),
    ),
  })
  .strict();
export type CorrectionsFile = z.infer<typeof correctionsFileSchema>;

export const beforeRowSchema = z
  .object({
    /** `pois.id`, for whoever follows a correction up in the database. */
    id: z.uuid(),
    ref: refSchema,
    destination: z.string().min(1),
    name: z.string().min(1),
    name_local: z.string().nullable(),
    category: poiCategorySchema,
    lat: z.number(),
    lng: z.number(),
    address: z.string().nullable(),
    tz: z.string().nullable(),
    curated: z.boolean(),
    must_see: z.boolean(),
    /** Content ref of the record it already redirects to. */
    merged_into: refSchema.nullable(),
    /** The record's item in the live release, when it has one. */
    item: poiItemSchema.nullable(),
  })
  .strict();
export type BeforeRow = z.infer<typeof beforeRowSchema>;

export const beforeFileSchema = z
  .object({ taken_at: z.iso.datetime({ offset: true }), rows: z.array(beforeRowSchema) })
  .strict();

export function correctionsPaths(batchKey: string, root = FACTORY_DIR) {
  const dir = path.join(root, 'src', 'data', 'place-corrections');
  return {
    corrections: path.join(dir, `${batchKey}.json`),
    before: path.join(dir, `${batchKey}.before.json`),
  };
}

export function loadCorrections(
  batchKey: string,
  root = FACTORY_DIR,
): { file: CorrectionsFile; before: BeforeRow[] } {
  const paths = correctionsPaths(batchKey, root);
  return {
    file: correctionsFileSchema.parse(readJson<unknown>(paths.corrections)),
    before: beforeFileSchema.parse(readJson<unknown>(paths.before)).rows,
  };
}

/** Every record a corrections file names: the kept ones, then their duplicates. */
export function correctionRefs(places: readonly PlaceCorrection[]): string[] {
  return [...places.map((p) => p.keep), ...places.flatMap((p) => p.merge.map((m) => m.ref))];
}

/** Metres between two points (haversine). */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(h)));
}

function timeZone(row: BeforeRow): string {
  if (row.tz !== null) return row.tz;
  const code = curatedDestinations().find((d) => d.slug === row.destination)?.code;
  if (code === undefined) throw new Error(`${row.destination} has no curated places set`);
  return placeFacts(code).tz;
}

/** The item of a record no release stated yet, from the record itself and a given note. */
function newItem(row: BeforeRow, note: z.infer<typeof noteSchema>): Poi {
  const source = row.ref.split(':')[0] as keyof typeof LICENCES;
  const { tags, ...editorial } = note;
  return {
    ref: row.ref,
    destination: row.destination,
    name: row.name,
    name_local: row.name_local,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    address: row.address === '' ? null : row.address,
    tz: timeZone(row),
    tags,
    hours: null,
    licence: { source, source_id: row.ref.slice(source.length + 1), ...LICENCES[source] },
    editorial,
    merge_into: null,
    possible_duplicate_of: null,
  };
}

/**
 * The release items of a corrections file. A kept record carries its live item with the corrected
 * name, kind and must-see flag (or a new item from its note); a duplicate carries its own item,
 * the kept record's kind and the redirect. What a correction does not state stays as the live
 * release has it.
 */
export function correctionItems(
  places: readonly PlaceCorrection[],
  before: readonly BeforeRow[],
): Poi[] {
  const rows = new Map(before.map((row) => [row.ref, row]));
  const row = (ref: string, place: PlaceCorrection) => {
    const found = rows.get(ref);
    if (found === undefined) throw new Error(`${ref} is not in the snapshot`);
    if (found.destination !== place.destination) {
      throw new Error(`${ref} is in ${found.destination}, not ${place.destination}`);
    }
    return found;
  };
  const merged = new Set(places.flatMap((p) => p.merge.map((m) => m.ref)));
  const seen = new Set<string>();
  const once = (ref: string) => {
    if (seen.has(ref)) throw new Error(`${ref} is corrected twice`);
    seen.add(ref);
  };
  const items: Poi[] = [];
  for (const place of places) {
    const kept = row(place.keep, place);
    once(place.keep);
    if (merged.has(place.keep)) throw new Error(`${place.keep} is kept and merged away`);
    if (kept.merged_into !== null) throw new Error(`${place.keep} already redirects elsewhere`);
    const base = kept.item ?? (place.note === undefined ? undefined : newItem(kept, place.note));
    if (place.stated && base === undefined) {
      throw new Error(`${place.keep} (${kept.name}) joins the recommended set and needs a note`);
    }
    const category = place.category ?? base?.category ?? kept.category;
    if (place.stated && base !== undefined) {
      items.push({
        ...base,
        name: place.name ?? base.name,
        name_local: place.name_local === undefined ? base.name_local : place.name_local,
        category,
        editorial:
          place.must_see === undefined
            ? base.editorial
            : { ...base.editorial, must_see: place.must_see },
        merge_into: null,
        possible_duplicate_of: null,
      });
    }
    // A duplicate is hidden once merged; where it never had a note it borrows the kept record's.
    const note = base === undefined ? undefined : { ...base.editorial, tags: base.tags };
    for (const { ref } of place.merge) {
      const duplicate = row(ref, place);
      once(ref);
      const own = duplicate.item ?? (note === undefined ? undefined : newItem(duplicate, note));
      if (own === undefined) {
        throw new Error(`${ref} (${duplicate.name}) has no item and its kept record no note`);
      }
      const { must_see: _flag, ...editorial } = own.editorial;
      void _flag;
      items.push({
        ...own,
        category,
        editorial: duplicate.must_see ? { ...editorial, must_see: false } : editorial,
        merge_into: place.keep,
        possible_duplicate_of: null,
      });
    }
  }
  return poiItemSchema.array().parse(items);
}

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
  let added = 0;
  for (const place of places) {
    const kept = at(place.keep);
    const duplicates = place.merge.map((m) => at(m.ref));
    merges += duplicates.length;
    recommendedMerges += duplicates.filter((d) => d.curated && d.merged_into === null).length;
    if (place.stated && place.category !== undefined && place.category !== kept.category) {
      kindChanges += 1;
    }
    if (place.stated && place.name !== undefined && place.name !== kept.name) renames += 1;
    if (duplicates.some((d) => d.curated && metresBetween(d, kept) > FAR_M)) movedPoints += 1;
    if (place.must_see === true) mustSees += 1;
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
    added,
  };
}
