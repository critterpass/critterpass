/** The plain-words search module: its parse route, mounted from the planning aggregator. */
import type { PlanningModule } from '../register';
import { planningGateway } from './gateway';
import { registerSearchParseRoute } from './parse-route';

export const searchModule: PlanningModule = ({ app, doors, env }) => {
  const gateway = planningGateway(env, doors.pool);
  if (gateway === undefined) {
    doors.logger.warn({}, 'plain-words search parses by name only: ANTHROPIC_API_KEY is unset');
  }
  registerSearchParseRoute(app, { pool: doors.pool, sessions: doors.sessions, gateway });
};
