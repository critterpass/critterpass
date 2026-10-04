/** The plan check's fixers: their routes and commands, mounted from the planning aggregator. */
import { registerCheckCommands } from '../../commands/checks';
import { createPlanningProvider } from '../../routing/planning-provider';
import { planningFitTravel } from '../../routing/travel-modes';
import type { PlanningModule } from '../register';
import { tripStaySource } from '../stay';
import type { FixerDeps } from './check-input';
import { registerFixerRoutes } from './routes';

export const fixersModule: PlanningModule = ({ app, doors, env }) => {
  const deps: FixerDeps = {
    stays: tripStaySource,
    now: () => new Date(),
    travel: planningFitTravel(
      createPlanningProvider({ valhallaUrl: env.VALHALLA_URL, pool: doors.pool }),
    ),
  };
  registerFixerRoutes(app, doors, deps);
  registerCheckCommands(doors.registry, deps);
};
