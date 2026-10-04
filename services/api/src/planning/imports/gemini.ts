/**
 * The Gemini vision fallback for Add from a link, built only with `GEMINI_API_KEY`. Every call
 * first reads `ai.gemini_vision` (unset or false = no request leaves), then the route's kill
 * switch, the `gemini` tier switch and the cost guard's pause for that tier, and records usage.
 */
import { createGeminiVision, GEMINI_VISION_KEY, recordUsage, type GeminiVision } from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { createKillSwitches } from '../../ops/kill-switches';
import { readPlanningConfig } from '../search/fair-use';

export function planningGemini(
  apiKey: string | undefined,
  pool: pg.Pool,
  fetchImpl?: typeof fetch,
): GeminiVision | undefined {
  if (apiKey === undefined || apiKey === '') return undefined;
  // Keyed by route like every switch, but billed and paused as the gemini tier.
  const switches = createKillSwitches(pool, { tierOf: () => 'gemini' });
  return createGeminiVision({
    apiKey,
    enabled: async () =>
      (await withSystem(pool, (tx) => readPlanningConfig(tx, GEMINI_VISION_KEY))) === true,
    assertRouteOn: switches.assertAiRoute,
    onUsage: (record) => recordUsage((fn) => withSystem(pool, fn), record),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
