/**
 * Catalogue kinds the console edits (`upsert_catalogue_item {kind, id?, version, data}`) and partner
 * adapter contracts. Each kind's edit schema is strict: a field outside it (a guide's canonical
 * colour, a POI's generated columns) is a validation error, not a silent write. `version` is the
 * row's optimistic-concurrency token as the console last read it; a stale one is VERSION_CONFLICT.
 */
import { z } from 'zod';

import { destinationCoverageSchema, guideColourSchema } from '../enums/catalogue';
import { poiCategorySchema } from '../places/categories';
import { poiCurationSchema, poiStatusSchema } from '../places/poi';
import { partnerCopyModeSchema, partnerKeySchema } from './ops-enums';

export const CATALOGUE_KINDS = ['guides', 'destinations', 'pois'] as const;
export const catalogueKindSchema = z.enum(CATALOGUE_KINDS);
export type CatalogueKind = z.infer<typeof catalogueKindSchema>;

const nullableText = (max: number) => z.string().min(1).max(max).nullable();

/** Guides: name, voice and local words; the colour is canonical and never edited here. */
export const guideEditSchema = z
  .object({
    name: z.string().min(1).max(60),
    voice_id: nullableText(120).describe('Voice id'),
    persona_pack_version: nullableText(40),
    local_words: z.record(z.string().min(1), z.string().min(1)).describe('Local words'),
  })
  .strict();

export const destinationEditSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and hyphens'),
    name: z.string().min(1).max(80),
    country: nullableText(80),
    coverage: destinationCoverageSchema,
    colour: guideColourSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'ISO 4217 code')
      .nullable(),
    tz: nullableText(64).describe('Time zone (IANA)'),
    best_months: z.array(z.number().int().min(1).max(12)).nullable(),
  })
  .strict();

export const poiEditSchema = z
  .object({
    destination_id: z.uuid(),
    name: z.string().min(1).max(160),
    name_local: nullableText(160),
    category: poiCategorySchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: nullableText(300),
    status: poiStatusSchema,
    curation: poiCurationSchema,
    tags: z.array(z.string().min(1)),
    visit_radius_m: z.number().int().positive().nullable(),
  })
  .strict();

export const CATALOGUE_EDIT_SCHEMAS = {
  guides: guideEditSchema,
  destinations: destinationEditSchema,
  pois: poiEditSchema,
} as const satisfies Record<CatalogueKind, z.ZodObject>;

/** Kinds the console may create new rows for (the six guides are fixed). */
export const CREATABLE_CATALOGUE_KINDS: readonly CatalogueKind[] = ['destinations', 'pois'];

export const upsertCatalogueItemPayloadSchema = z
  .object({
    kind: catalogueKindSchema,
    id: z.uuid().optional(),
    /** `null` when creating. */
    version: z.string().min(1).nullable(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type UpsertCatalogueItemPayload = z.infer<typeof upsertCatalogueItemPayloadSchema>;

export const catalogueItemSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  data: z.record(z.string(), z.unknown()),
  /** Shown but not editable (a guide's colour). */
  locked: z.record(z.string(), z.unknown()),
});
export type CatalogueItem = z.infer<typeof catalogueItemSchema>;

export const partnerAdapterSchema = z.object({
  partner: partnerKeySchema,
  enabled: z.boolean(),
  copy_mode: partnerCopyModeSchema,
  approved_at: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});
export type PartnerAdapter = z.infer<typeof partnerAdapterSchema>;
export const partnerAdaptersResponseSchema = z.object({ items: z.array(partnerAdapterSchema) });

export const setPartnerAdapterPayloadSchema = z
  .object({
    partner: partnerKeySchema,
    enabled: z.boolean(),
    copy_mode: partnerCopyModeSchema,
    notes: z.string().max(2000).nullable(),
    version: z.number().int().min(1),
  })
  .strict();
export type SetPartnerAdapterPayload = z.infer<typeof setPartnerAdapterPayloadSchema>;
