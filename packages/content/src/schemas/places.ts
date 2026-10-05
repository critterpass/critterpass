/**
 * Place content: the 61-place index (one critter set per place) and curated POIs for the six
 * guide destinations. POIs come from open data only (FSQ OS Places, Overture) plus editorial text
 * written from it; supplier content never enters a release. Opening hours researched from official
 * sites are proposals until a person verifies them (see `hoursProposalSchema`).
 */
import { editorialTranslationsSchema, hoursSchema, poiCategorySchema } from '@cp/domain';
import { z } from 'zod';

import {
  countryCodeSchema,
  critterIdSchema,
  currencyCodeSchema,
  httpsUrlSchema,
  languageTagSchema,
  placeCodeSchema,
  slugSchema,
  timeZoneSchema,
} from './common';
import { PERSONA_KEYS } from './personas';
import { tasteTagSchema } from './taste-quiz';
import { poiRefSchema } from './spawn-rules';

/**
 * The fewest critters each set group launches with. A place's set may grow past it as new critters
 * roll out (Vietnam's gained Chà Vá, its guide), so the index data, not this table, holds the size.
 */
export const SET_GROUP_MIN_SIZES: Readonly<Record<0 | 1 | 2 | 3, number>> = {
  0: 10,
  1: 5,
  2: 3,
  3: 1,
};

export const monthHintSchema = z
  .object({
    /** Editorial crowd level for the month, 0 (empty) to 100 (peak); live data overlays it. */
    crowd: z.number().int().min(0).max(100),
    note: z.string().min(1).max(60).nullable(),
  })
  .strict();

export const placeIndexItemSchema = z
  .object({
    code: placeCodeSchema,
    name: z.string().min(1),
    country: countryCodeSchema,
    rank: z.number().int().min(1).max(60).nullable(),
    set_group: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    tz: timeZoneSchema,
    currency: currencyCodeSchema,
    languages: z.array(languageTagSchema).min(1),
    coverage: z.enum(['live', 'guest']),
    /** The live guide's persona key; null where the guest guide covers. */
    guide: z.enum(PERSONA_KEYS).exclude(['guest']).nullable(),
    /** `destinations.slug` of the guide destination inside this place, when there is one. */
    destination: slugSchema.nullable(),
    hero_critter_id: critterIdSchema,
    critter_ids: z.array(critterIdSchema).min(1),
    month_hints: z.array(monthHintSchema).length(12),
  })
  .strict()
  .superRefine((place, ctx) => {
    if (place.critter_ids.length < SET_GROUP_MIN_SIZES[place.set_group]) {
      ctx.addIssue({
        code: 'custom',
        message: `set group ${place.set_group} holds at least ${SET_GROUP_MIN_SIZES[place.set_group]} critters`,
      });
    }
    if (new Set(place.critter_ids).size !== place.critter_ids.length) {
      ctx.addIssue({ code: 'custom', message: 'a critter appears in the set once' });
    }
    if (!place.critter_ids.includes(place.hero_critter_id)) {
      ctx.addIssue({ code: 'custom', message: 'the hero critter lives in the set' });
    }
    if ((place.coverage === 'live') !== (place.guide !== null)) {
      ctx.addIssue({ code: 'custom', message: 'live places have a guide; guest places do not' });
    }
  });
export type PlaceIndexItem = z.infer<typeof placeIndexItemSchema>;

export const OPEN_DATA_SOURCES = ['fsq_os', 'overture', 'editorial'] as const;

export const poiLicenceSchema = z
  .object({
    source: z.enum(OPEN_DATA_SOURCES),
    /** Source record id (the POI's conflation key). */
    source_id: z.string().min(1),
    licence: z.string().min(1),
    attribution: z.string().min(1),
  })
  .strict();

/** The lines of a place's editorial note; `poiEditorialSchema` adds the rule between the flags. */
export const poiEditorialFields = z
  .object({
    why_go: z.string().min(1).max(200),
    best_time: z.string().min(1).max(80),
    time_needed_min: z
      .number()
      .int()
      .min(10)
      .max(24 * 60),
    crowd_hint: z.string().min(1).max(80),
    etiquette: z.string().min(1).max(160).nullable(),
    /**
     * A sight the destination is known for (a pinned place or a landmark). Publishing writes it to
     * `pois.editorial.must_see`; an item without it leaves the place's flag as it is.
     */
    must_see: z.boolean().optional(),
    /**
     * One of the dozen or so must-sees a first visit to the destination is built around (at most
     * `MAX_ESSENTIALS` a destination). Publishing writes it to `pois.editorial.essential`, key by
     * key like `must_see`: an item without it leaves the flag as it is, `false` clears it.
     */
    essential: z.boolean().optional(),
  })
  .strict();

export const poiEditorialSchema = poiEditorialFields.refine(
  (editorial) => editorial.essential !== true || editorial.must_see === true,
  { message: 'an essential place is also a must-see', path: ['essential'] },
);

/** The most places of one destination that may be flagged essential. */
export const MAX_ESSENTIALS = 15;

export const poiItemSchema = z
  .object({
    ref: poiRefSchema,
    destination: slugSchema,
    name: z.string().min(1),
    name_local: z.string().min(1).nullable(),
    category: poiCategorySchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1).nullable(),
    tz: timeZoneSchema,
    tags: z.array(tasteTagSchema).min(1),
    /** Only verified hours ever ship; unverified research stays a proposal. */
    hours: hoursSchema.nullable(),
    licence: poiLicenceSchema,
    editorial: poiEditorialSchema,
    /** The same place under another record (decided a duplicate): publishing redirects this one. */
    merge_into: poiRefSchema.nullable(),
    /** A nearby record that may be the same place; a reviewer decides. */
    possible_duplicate_of: poiRefSchema.nullable(),
    /**
     * Takes the record out of the catalogue: publishing sets it to status `hidden` and takes it
     * out of the recommended set (a record pinned far from the place it names, with no record at
     * the place to merge it into). Publishing refuses while a trip's stop, idea or must-do points
     * at it. A hidden record is neither merged nor a must-see.
     */
    hide: z.literal(true).optional(),
    /**
     * The note in other app languages (`{"vi": {why_go, best_time, …}}`), written by an editor
     * from the English lines with the same facts. Publishing stores it as `editorial.i18n`; an
     * item without it clears what was stored. Readers pick a line through `localizedEditorial`.
     */
    i18n: editorialTranslationsSchema.optional(),
  })
  .strict()
  .refine(
    (poi) => poi.hide !== true || (poi.merge_into === null && poi.editorial.must_see !== true),
    { message: 'a hidden place is neither merged nor a must-see', path: ['hide'] },
  )
  .refine((poi) => poi.i18n?.en === undefined, {
    message: 'the English note is the note itself, not a translation',
    path: ['i18n', 'en'],
  });
export type PoiItem = z.infer<typeof poiItemSchema>;

/** Opening hours read from an official venue or tourism site, waiting for a person to verify them. */
export const hoursProposalSchema = z
  .object({
    poi_ref: poiRefSchema,
    hours: hoursSchema,
    source_url: httpsUrlSchema,
    fetched_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export type HoursProposal = z.infer<typeof hoursProposalSchema>;
