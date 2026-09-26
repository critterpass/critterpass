/**
 * Destination and guide catalogue enums (docs/data-model.md §3.3, docs/product-decisions.md C5).
 */
import { z } from 'zod';

/** Canonical guide palette (docs/product-decisions.md C5): Tokek/Pon/Lundi/Ajo/Sardi/Paco. */
export const GUIDE_COLOURS = ['yellow', 'orange', 'blue', 'pink', 'green', 'cream'] as const;
export const guideColourSchema = z.enum(GUIDE_COLOURS);
export type GuideColour = z.infer<typeof guideColourSchema>;

export const DESTINATION_COVERAGES = ['live', 'guest'] as const;
export const destinationCoverageSchema = z.enum(DESTINATION_COVERAGES);
export type DestinationCoverage = z.infer<typeof destinationCoverageSchema>;
