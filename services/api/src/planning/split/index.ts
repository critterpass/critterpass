/**
 * The split module: the crew-can't-agree route, with the guide wording its options when a key is
 * set, and the hook that applies a split's winning way when its decision vote closes.
 */
import { createGateway, recordUsage } from '@cp/ai';
import { withSystem } from '@cp/db';

import { createKillSwitches } from '../../ops/kill-switches';
import type { PlanningModule } from '../register';
import { splitDecisionHooks } from './decision-close';
import { registerSplitRoute } from './route';

export const splitModule: PlanningModule = (deps) => {
  const { app, doors, env } = deps;
  splitDecisionHooks(deps);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: createKillSwitches(doors.pool).assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(doors.pool, fn), record),
        });
  registerSplitRoute(app, { ...doors, gateway });
};
