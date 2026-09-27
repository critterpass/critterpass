/**
 * The catalogue kinds the console edits. Edit schemas come from `@cp/domain` (the api validates the
 * same ones); locked fields are shown beside them but never sent.
 */
import {
  CREATABLE_CATALOGUE_KINDS,
  destinationEditSchema,
  guideColourSchema,
  guideEditSchema,
  poiEditSchema,
  type CatalogueItem,
  type CatalogueKind,
} from '@cp/domain';
import { lazy } from 'react';
import { z } from 'zod';

import { formatValue } from '../../kit/diff';
import { defineCatalogue, type CatalogueDefinition } from '../../kit/registry';

// MapLibre is large; load it only when a POI is opened.
const PoiMapPreview = lazy(() =>
  import('./poi-map').then((module) => ({ default: module.PoiMapPreview })),
);

const text = (value: unknown) => (value === null ? '—' : formatValue(value));

export const CATALOGUES: Readonly<Record<CatalogueKind, CatalogueDefinition<CatalogueItem>>> = {
  guides: defineCatalogue<CatalogueItem>({
    kind: 'guides',
    label: 'Guides',
    schema: guideEditSchema.extend({
      slug: z.string().max(60),
      colour: guideColourSchema.describe('Colour (canonical)'),
    }),
    readOnly: ['slug', 'colour'],
    columns: [
      { id: 'name', label: 'Name', value: (item) => item.title },
      { id: 'colour', label: 'Colour', value: (item) => text(item.locked['colour']) },
      { id: 'voice', label: 'Voice', value: (item) => text(item.data['voice_id']) },
    ],
    itemId: (item) => item.id,
    title: (item) => item.title,
    values: (item) => ({ ...item.data, ...item.locked }),
    creatable: CREATABLE_CATALOGUE_KINDS.includes('guides'),
  }),
  destinations: defineCatalogue<CatalogueItem>({
    kind: 'destinations',
    label: 'Destinations',
    schema: destinationEditSchema,
    columns: [
      { id: 'name', label: 'Name', value: (item) => item.title },
      { id: 'country', label: 'Country', value: (item) => text(item.data['country']) },
      { id: 'coverage', label: 'Coverage', value: (item) => text(item.data['coverage']) },
      { id: 'currency', label: 'Currency', value: (item) => text(item.data['currency']) },
    ],
    itemId: (item) => item.id,
    title: (item) => item.title,
    values: (item) => item.data,
    creatable: CREATABLE_CATALOGUE_KINDS.includes('destinations'),
  }),
  pois: defineCatalogue<CatalogueItem>({
    kind: 'pois',
    label: 'POIs',
    schema: poiEditSchema,
    columns: [
      { id: 'name', label: 'Name', value: (item) => item.title },
      { id: 'category', label: 'Category', value: (item) => text(item.data['category']) },
      { id: 'status', label: 'Status', value: (item) => text(item.data['status']) },
    ],
    itemId: (item) => item.id,
    title: (item) => item.title,
    values: (item) => item.data,
    creatable: CREATABLE_CATALOGUE_KINDS.includes('pois'),
    preview: PoiMapPreview,
  }),
};

/** Blank values for a new item: every nullable field null, arrays and records empty. */
export function blankValues(schema: z.ZodObject): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([name, field]) => {
      const zodField = field as z.ZodType;
      if (zodField.safeParse(null).success) return [name, null];
      if (zodField.safeParse([]).success) return [name, []];
      if (zodField.safeParse({}).success) return [name, {}];
      return [name, undefined];
    }),
  );
}
