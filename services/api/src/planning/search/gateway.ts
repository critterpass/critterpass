/**
 * The api's model gateway for planning search work: built only with a model key
 * (`ANTHROPIC_API_KEY`, the DeepSeek key), honouring the ops kill switches and the cost guard's
 * pause, and recording usage like every other gateway call.
 */
import { createGateway, recordUsage, type Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { ApiEnv } from '../../env';
import { createKillSwitches } from '../../ops/kill-switches';

export function planningGateway(
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL'>,
  pool: pg.Pool,
): Gateway | undefined {
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  const switches = createKillSwitches(pool);
  return createGateway({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    assertRouteOn: switches.assertAiRoute,
    onUsage: (record) => recordUsage((fn) => withSystem(pool, fn), record),
  });
}
