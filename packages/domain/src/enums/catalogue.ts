/**
 * Destination and guide catalogue enums (docs/data-model.md §3.3, docs/product-decisions.md).
 */
import { z } from 'zod';

/**
 * Canonical guide palette (docs/product-decisions.md): Tokek/Pon/Lundi/Ajo/Sardi/Paco. These six
 * accents are also the member palette (`crews/colours.ts`), so a later guide's colour is added to
 * the schema below, never to this list.
 */
export const GUIDE_COLOURS = ['yellow', 'orange', 'blue', 'pink', 'green', 'cream'] as const;
/** Every guide's colour: the six canonical accents plus Chà Vá's red. */
export const guideColourSchema = z.enum([...GUIDE_COLOURS, 'red']);
export type GuideColour = z.infer<typeof guideColourSchema>;

export const DESTINATION_COVERAGES = ['live', 'guest'] as const;
export const destinationCoverageSchema = z.enum(DESTINATION_COVERAGES);
export type DestinationCoverage = z.infer<typeof destinationCoverageSchema>;
