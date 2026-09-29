/**
 * Curated POIs for the six guide destinations. The brief (./brief) picks the curated few hundred of
 * each destination's active POIs as the importer left them (FSQ OS Places and Overture open data only: names, categories, addresses,
 * coordinates) and runs the duplicate sweep; the model writes the editorial overlay and taste tags
 * from those fields alone. Supplier content never enters: the only sources a POI can carry are
 * fsq_os, overture and editorial, and editorial text naming a supplier fails validation.
 */
import { poiItemSchema, TASTE_TAGS, type ContentItem } from '@cp/content';
import { hoursSchema } from '@cp/domain';
import { z } from 'zod';

import { insidePlace } from '../../data/country-bounds';
import { PLACE_FACTS } from '../../data/place-facts';
import { suppliersNamed } from '../../suppliers';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';
import { poisBrief } from './brief';
import type { DuplicateVerdict } from './duplicates';

export { placesNetwork } from './brief';

export const MIN_POIS_PER_CITY = 250;

export const LICENCES: Readonly<
  Record<'fsq_os' | 'overture' | 'editorial', { licence: string; attribution: string }>
> = {
  fsq_os: { licence: 'Apache-2.0', attribution: 'Foursquare Open Source Places' },
  overture: { licence: 'CDLA-Permissive-2.0', attribution: 'Overture Maps Foundation' },
  editorial: { licence: 'CritterPass editorial', attribution: 'CritterPass' },
};

export interface PoiSource {
  readonly ref: string;
  readonly destination: string;
  readonly code: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly tz: string;
  readonly hours: unknown;
  readonly duplicate: { readonly of: string; readonly verdict: DuplicateVerdict } | null;
}

const editorialSchema = z.object({
  pois: z.array(
    z.object({
      ref: z.string(),
      why_go: z.string().min(1).max(200),
      best_time: z.string().min(1).max(80),
      // Model replies occasionally overshoot these bounds; clamp rather than regenerate the unit.
      time_needed_min: z.number().transform((n) => Math.min(1440, Math.max(10, Math.round(n)))),
      crowd_hint: z.string().min(1).max(80),
      etiquette: z.string().min(1).max(160).nullable(),
      tags: z
        .array(z.enum(TASTE_TAGS))
        .min(1)
        .transform((tags) => tags.slice(0, 4)),
    }),
  ),
});
type Editorial = z.infer<typeof editorialSchema>['pois'][number];

const SYSTEM = `You write short, honest editorial notes for places in a travel app, from the place's name, category and address only.
For each place: why_go (one sentence, at most 160 characters), best_time (e.g. "Early morning before tour buses"), time_needed_min (typical visit, minutes), crowd_hint (at most 60 characters), etiquette (dress or behaviour guidance for temples, shrines and similar, otherwise null) and 1-4 taste tags from the allowed list.
Never mention prices, booking sites, tour operators, hotels or reviews. If you do not know a place, keep the notes generic to its category rather than inventing specifics. Reply with JSON only.`;

function poisPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const pois = unit.input as PoiSource[];
  const notes = brief.notes?.['*'];
  const list = pois
    .map(
      (p) =>
        `- ${p.ref}: ${p.name}${p.nameLocal ? ` (${p.nameLocal})` : ''}, ${p.category}${p.address ? `, ${p.address}` : ''}`,
    )
    .join('\n');
  return {
    system: SYSTEM,
    user: `Destination: ${pois[0]?.destination ?? ''}.\nAllowed tags: ${TASTE_TAGS.join(', ')}.\n${notes ? `Reviewer notes: ${notes}\n` : ''}Places:\n${list}\n\nReturn {"pois": [...]} with one entry per place.`,
    schema: editorialSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        pois: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string' },
              why_go: { type: 'string' },
              best_time: { type: 'string' },
              time_needed_min: { type: 'integer' },
              crowd_hint: { type: 'string' },
              etiquette: { type: ['string', 'null'] },
              tags: { type: 'array', items: { type: 'string', enum: [...TASTE_TAGS] } },
            },
            required: [
              'ref',
              'why_go',
              'best_time',
              'time_needed_min',
              'crowd_hint',
              'etiquette',
              'tags',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['pois'],
      additionalProperties: false,
    },
  };
}

export function toPoiItem(source: PoiSource, editorial: Editorial): ContentItem<'places'> {
  const kind = source.ref.split(':')[0] as keyof typeof LICENCES;
  const hours = hoursSchema.safeParse(source.hours);
  return poiItemSchema.parse({
    ref: source.ref,
    destination: source.destination,
    name: source.name,
    name_local: source.nameLocal,
    category: source.category,
    lat: source.lat,
    lng: source.lng,
    // Some open-data rows carry an empty address string rather than none.
    address: source.address === '' ? null : source.address,
    tz: source.tz,
    tags: editorial.tags,
    hours: hours.success ? hours.data : null,
    licence: { source: kind, source_id: source.ref.slice(kind.length + 1), ...LICENCES[kind] },
    editorial: {
      why_go: editorial.why_go,
      best_time: editorial.best_time,
      time_needed_min: editorial.time_needed_min,
      crowd_hint: editorial.crowd_hint,
      etiquette: editorial.etiquette,
    },
    merge_into: source.duplicate?.verdict === 'merge' ? source.duplicate.of : null,
    possible_duplicate_of: source.duplicate?.verdict === 'review' ? source.duplicate.of : null,
  });
}

export const placesKind: KindModule<'places'> = {
  kind: 'places',
  title: (ctx) => `Places · ${ctx.options['destinations'] ?? 'guide cities'}`,
  gate: 'places_review',
  brief: (ctx) => poisBrief(ctx.options),
  prompt: poisPrompt,
  assemble: (_ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof editorialSchema> | undefined;
        if (output === undefined) return [];
        return (unit.input as PoiSource[]).flatMap((source) => {
          const editorial = output.pois.find((p) => p.ref === source.ref);
          return editorial === undefined ? [] : [toPoiItem(source, editorial)];
        });
      }),
    ),
  validators: {
    items: [
      {
        id: 'inside-destination',
        severity: 'fail',
        check: (poi) => {
          const code =
            Object.entries(PLACE_FACTS).find(([, f]) => f.destination === poi.destination)?.[0] ??
            '';
          return insidePlace(code, poi.lat, poi.lng)
            ? []
            : [`${poi.name} is outside ${poi.destination}'s country`];
        },
      },
      {
        id: 'no-supplier-text',
        severity: 'fail',
        check: (poi) => {
          return suppliersNamed(Object.values(poi.editorial).join(' ')).map(
            (word) => `editorial names a supplier (${word})`,
          );
        },
      },
      {
        id: 'possible-duplicate',
        severity: 'warn',
        check: (poi) =>
          poi.possible_duplicate_of === null
            ? []
            : [`may be the same place as ${poi.possible_duplicate_of}`],
      },
    ],
    batch: [
      {
        id: 'city-coverage',
        severity: 'warn',
        check: ({ items }) => {
          const counts = new Map<string, number>();
          for (const poi of items)
            counts.set(poi.destination, (counts.get(poi.destination) ?? 0) + 1);
          return [...counts]
            .filter(([, n]) => n < MIN_POIS_PER_CITY)
            .map(([city, n]) => ({
              ref: null,
              message: `${city} has ${n} curated POIs; launch needs ${MIN_POIS_PER_CITY}`,
            }));
        },
      },
    ],
  },
};

registerKind(placesKind);
