/**
 * Registers the api's own tool executors with the gateway's tool registry: the places tools run
 * as `guide_reader` against `llm.pois` (src/places/tool-executors.ts); the travel-data tools read
 * the cached fare, weather, crowd and FX tables (src/travel-data/tool-executors.ts); the cost tools
 * price plan changes and check fits with the cost engine and planner (src/cost/tool-executors.ts);
 * and `web_search` runs through the configured search provider (`TAVILY_API_KEY`) with its supplier
 * screen. Tools whose owning module lives elsewhere register there; any tool left unregistered
 * answers `TOOL_UNAVAILABLE`.
 */
import {
  createWebSearchExecutor,
  type SearchProvider,
  type ToolContext,
  type ToolRegistry,
} from '@cp/ai';
import { withGuideReader } from '@cp/db';
import type pg from 'pg';
import type { Logger } from 'pino';

import { registerBookingToolExecutors } from '../bookings/tools';
import { registerCostToolExecutors } from '../cost/tool-executors';
import { registerMoneyToolExecutors } from '../money/tools';
import { placeDetailsTool, placesSearchTool } from '../places/tool-executors';
import { registerSupplierToolExecutors } from '../suppliers/tool-executors';
import { registerTravelDataToolExecutors } from '../travel-data/tool-executors';

/** The places tools are trip-scoped reads: `app.trip` comes from the turn, never from the model. */
function tripOf(context: ToolContext): string {
  return context.tripId ?? '';
}

interface Participant {
  readonly display_name: string | null;
}

/**
 * The trip's crew names, cut from every web search query: whole display names, and each name part
 * of three letters or more that is not also part of the destination's name ("An" in "Hội An").
 */
async function crewNames(pool: pg.Pool, context: ToolContext): Promise<string[]> {
  if (context.tripId === null) return [];
  return withGuideReader(pool, context.uid, context.tripId, async (tx) => {
    const { rows } = await tx.query<{
      participants: Participant[] | null;
      destination_name: string | null;
    }>('SELECT participants, destination_name FROM llm.trip_context');
    const row = rows[0];
    const place = new Set((row?.destination_name ?? '').toLowerCase().split(/\s+/u));
    return (row?.participants ?? []).flatMap(({ display_name: name }) => {
      if (name === null || name.trim() === '') return [];
      const parts = name.split(/\s+/u).filter((part) => part.length >= 3);
      return [name, ...parts.filter((part) => !place.has(part.toLowerCase()))];
    });
  });
}

export interface ApiToolExecutorOptions {
  /** The web search provider (`searchProviderFromEnv()`); unset = web search is unavailable. */
  readonly search?: SearchProvider | undefined;
  readonly logger?: Pick<Logger, 'error'>;
}

export function registerApiToolExecutors(
  registry: ToolRegistry,
  pool: pg.Pool,
  options: ApiToolExecutorOptions = {},
): void {
  if (options.search !== undefined) {
    registry.registerToolExecutor(
      'web_search',
      createWebSearchExecutor(options.search, {
        privateTerms: (context) => crewNames(pool, context),
        // A leak through the provider's own exclusion: the screen dropped it, the log says so.
        onBlocked: (urls, provider) =>
          options.logger?.error(
            { urls, provider },
            'web search returned a blocked supplier domain',
          ),
      }),
    );
  }
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
  registerMoneyToolExecutors(registry, pool);
  registerCostToolExecutors(registry, pool);
  registerBookingToolExecutors(registry, pool);
  registerSupplierToolExecutors(registry, pool);
}
