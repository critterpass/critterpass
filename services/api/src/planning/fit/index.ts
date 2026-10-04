/** The fit module: its routes, mounted from the planning aggregator. */
import { createPlanningProvider } from '../../routing/planning-provider';
import { planningFitTravel } from '../../routing/travel-modes';
import type { PlanningModule } from '../register';
import { tripStaySource } from '../stay';
import { registerFitRoutes } from './routes';

export const fitModule: PlanningModule = ({ app, doors, env }) => {
  registerFitRoutes(app, doors, {
    stays: tripStaySource,
    travel: planningFitTravel(
      createPlanningProvider({ valhallaUrl: env.VALHALLA_URL, pool: doors.pool }),
    ),
    now: () => new Date(),
  });
};
