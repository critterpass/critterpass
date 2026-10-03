/**
 * Response shapes of the Valhalla HTTP API (`valhalla_service`, 3.8.x) the client reads, checked
 * at the network boundary. Valhalla answers `time` in seconds and `length`/`distance` in the
 * request's `units` (the client always asks for kilometres).
 */
import { z } from 'zod';

const summarySchema = z.object({ time: z.number(), length: z.number() });

export const routeResponseSchema = z.object({
  trip: z.object({
    summary: summarySchema,
    legs: z.array(z.object({ summary: summarySchema })),
    locations: z.array(z.object({ original_index: z.number().int().optional() })),
  }),
});

export const matrixResponseSchema = z.object({
  sources_to_targets: z.array(
    z.array(z.object({ time: z.number().nullable(), distance: z.number().nullable() })),
  ),
});

export const locateResponseSchema = z.array(
  z.object({
    edges: z
      .array(z.object({ correlated_lat: z.number(), correlated_lon: z.number() }))
      .nullable()
      .optional(),
  }),
);

export const errorBodySchema = z.object({
  error_code: z.number().int(),
  error: z.string().optional(),
});
