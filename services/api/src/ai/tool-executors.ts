/**
 * Registers the api's own tool executors with the gateway's tool registry: the places tools run
 * as `guide_reader` against `llm.pois` (src/places/tool-executors.ts); the travel-data tools read
 * the cached fare, weather, crowd and FX tables (src/travel-data/tool-executors.ts). Tools whose owning module
 * lives elsewhere register there; any tool left unregistered answers `TOOL_UNAVAILABLE`.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import type pg from 'pg';

import { placeDetailsTool, placesSearchTool } from '../places/tool-executors';
import { registerTravelDataToolExecutors } from '../travel-data/tool-executors';

/** The places tools are trip-scoped reads: `app.trip` comes from the turn, never from the model. */
function tripOf(context: ToolContext): string {
  return context.tripId ?? '';
}

export function registerApiToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  registry.registerToolExecutor('places_search', async (input, context) => {
    const { dietary, ...query } = input;
    const results = await placesSearchTool(pool, context.uid, tripOf(context), query);
    // Dietary needs narrow to places tagged with every requested need; untagged places drop out
    // rather than being presented as suitable.
    if (dietary === undefined || dietary.length === 0) return [...results];
    return results.filter((place) => dietary.every((need) => place.tags.includes(need)));
  });
  registry.registerToolExecutor('place_details', (input, context) =>
    placeDetailsTool(pool, context.uid, tripOf(context), input),
  );
  registerTravelDataToolExecutors(registry, pool);
}
