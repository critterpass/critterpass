/**
 * Curated POIs for the guide destinations and the other curated cities. The brief (./brief) picks the curated few hundred of
 * each destination's active POIs as the importer left them (FSQ OS Places and Overture open data only: names, categories, addresses,
 * coordinates) and runs the duplicate sweep; the model writes the editorial overlay and taste tags
 * from those fields alone. Supplier content never enters: the only sources a POI can carry are
 * fsq_os, overture and editorial, and editorial text naming a supplier fails validation.
 */
import { MAX_ESSENTIALS, poiItemSchema, TASTE_TAGS, type ContentItem } from '@cp/content';
import { hoursSchema } from '@cp/domain';
import { z } from 'zod';

import { insidePlace } from '../../data/country-bounds';
import { curatedDestinations } from '../../data/place-facts';
import { suppliersNamed } from '../../suppliers';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';
import { poisBrief } from './brief';
import type { DuplicateVerdict } from './duplicates';
import { ALONE, FROM_NAME, readsTheName, standsAlone, unsupportedClaim } from './note-checks';

export { placesNetwork } from './brief';
export { namedFood, unsupportedClaim } from './note-checks';

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
  /** A pinned place or a landmark: in the set whatever its score, and first on the review page. */
  readonly mustSee?: boolean;
  /** A pin the curator marked as one of the destination's essentials. */
  readonly essential?: boolean;
  /** What a pinned place is ("a café"), as the curator pinned it. */
  readonly kind?: string;
}

const editorialSchema = z.object({
  // A place no taste tag fits (a hospital, say) comes back untagged; it is left out of the curated
  // set rather than failing the unit or getting an invented tag.
  pois: z
    .array(
      z.object({
        ref: z.string(),
        why_go: z
          .string()
          .min(1)
          .max(200)
          .refine(standsAlone, ALONE)
          .refine((text) => readsTheName(text) === null, FROM_NAME),
        best_time: z.string().min(1).max(80),
        // Model replies occasionally overshoot these bounds; clamp rather than regenerate the unit.
        time_needed_min: z.number().transform((n) => Math.min(1440, Math.max(10, Math.round(n)))),
        crowd_hint: z.string().min(1).max(80).refine(standsAlone, ALONE),
        etiquette: z.string().min(1).max(160).nullable(),
        tags: z.array(z.enum(TASTE_TAGS)).transform((tags) => tags.slice(0, 4)),
      }),
    )
    .transform((pois) => pois.filter((poi) => poi.tags.length > 0)),
});
type Editorial = z.infer<typeof editorialSchema>['pois'][number];

const SYSTEM = `You write short, honest editorial notes for places in a travel app, from the place's name, category and address only.
For each place: why_go (one sentence, at most 160 characters), best_time (e.g. "Early morning before tour buses"), time_needed_min (typical visit, minutes), crowd_hint (at most 60 characters), etiquette (dress or behaviour guidance for temples, shrines and similar, otherwise null) and 1-4 taste tags from the allowed list.
Never mention prices, booking sites, tour operators, hotels or reviews. If you do not know a place, keep the notes generic to its category rather than inventing specifics.
State only what the name, category and address support, or what is widely documented about a famous landmark: no dates, founders, dishes, decor, views, facilities, activities or opening times you are not sure of.
A note says what the record says (what kind of place it is, its street or area) and, for a well-known place, what is widely documented about it, plainly: "See prehistoric Sa Huynh artefacts and burial jars from central Vietnam." Where a line says what the place is ("it is a café"), write for that and nothing else.
Never read meaning into a name: no "its name suggests", no atmosphere, mood, decor or theme taken from what the name means or sounds like, and no remark about the name itself.
Write each place on its own: never compare it with other places, and never call it another, a second or an alternative one. Reply with JSON only.`;

function poisPrompt(unit: GenerationUnit, brief: Brief): Prompt {
  const pois = unit.input as PoiSource[];
  const notes = brief.notes?.['*'];
  const list = pois
    .map(
      (p) =>
        `- ${p.ref}: ${p.name}${p.nameLocal ? ` (${p.nameLocal})` : ''}, ${p.category}${p.address ? `, ${p.address}` : ''}${p.kind ? `; it is ${p.kind}` : ''}`,
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

export function toPoiItem(
  source: PoiSource,
  editorial: Editorial,
  mustSee = source.mustSee === true,
  essential = source.essential === true,
): ContentItem<'places'> {
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
      must_see: mustSee,
      // Stated only where set, so a generated batch leaves a flag a curator gave by hand.
      ...(essential && mustSee ? { essential: true } : {}),
    },
    merge_into: source.duplicate?.verdict === 'merge' ? source.duplicate.of : null,
    possible_duplicate_of: source.duplicate?.verdict === 'review' ? source.duplicate.of : null,
  });
}

/** The must-sees: each pinned place or landmark, and the record it merges into when it is one. */
export function mustSeeRefs(
  sources: readonly PoiSource[],
  flagged: (source: PoiSource) => boolean = (source) => source.mustSee === true,
): Set<string> {
  const byRef = new Map(sources.map((source) => [source.ref, source]));
  const refs = new Set<string>();
  for (const source of sources.filter(flagged)) {
    let ref = source.ref;
    for (let hops = 0; hops < 5; hops += 1) {
      refs.add(ref);
      const duplicate = byRef.get(ref)?.duplicate;
      if (duplicate?.verdict !== 'merge') break;
      ref = duplicate.of;
    }
  }
  return refs;
}

export const placesKind: KindModule<'places'> = {
  kind: 'places',
  title: (ctx) => `Places · ${ctx.options['destinations'] ?? 'guide cities'}`,
  gate: 'places_review',
  brief: (ctx) => poisBrief(ctx.options),
  prompt: poisPrompt,
  assemble: (_ctx, brief, outputs) => {
    const sources = brief.units.flatMap((unit) => unit.input as PoiSource[]);
    const mustSee = mustSeeRefs(sources);
    const essential = mustSeeRefs(sources, (source) => source.essential === true);
    return Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof editorialSchema> | undefined;
        if (output === undefined) return [];
        return (unit.input as PoiSource[]).flatMap((source) => {
          const editorial = output.pois.find((p) => p.ref === source.ref);
          return editorial === undefined
            ? []
            : [toPoiItem(source, editorial, mustSee.has(source.ref), essential.has(source.ref))];
        });
      }),
    );
  },
  validators: {
    items: [
      {
        id: 'inside-destination',
        severity: 'fail',
        check: (poi) => {
          const code = curatedDestinations().find((d) => d.slug === poi.destination)?.code ?? '';
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
        id: 'reads-the-name',
        severity: 'fail',
        check: (poi) => {
          const reading = readsTheName(poi.editorial.why_go);
          return reading === null ? [] : [`the note reads meaning into the name ("${reading}")`];
        },
      },
      {
        id: 'unsupported-claim',
        severity: 'warn',
        check: (poi) => {
          const claim = unsupportedClaim(poi);
          return claim === null ? [] : [`check the claim "${claim}" against a source`];
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
        // Counted over the live release with the batch laid on it: a batch states only its changes.
        id: 'essentials-cap',
        severity: 'fail',
        check: ({ items, previous }) => {
          const merged = new Map(previous.map((poi) => [poi.ref, poi]));
          for (const poi of items) merged.set(poi.ref, poi);
          const counts = new Map<string, number>();
          for (const poi of merged.values()) {
            if (poi.editorial.essential !== true || poi.merge_into !== null) continue;
            counts.set(poi.destination, (counts.get(poi.destination) ?? 0) + 1);
          }
          return [...counts]
            .filter(([, n]) => n > MAX_ESSENTIALS)
            .map(([city, n]) => ({
              ref: null,
              message: `${city} has ${n} essential places; at most ${MAX_ESSENTIALS}`,
            }));
        },
      },
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
