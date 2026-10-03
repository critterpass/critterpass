/** The fit module: its routes, mounted from the planning aggregator. */
import type { PlanningModule } from '../register';
import { registerFitRoutes } from './routes';

export const fitModule: PlanningModule = ({ app, doors }) => {
  registerFitRoutes(app, doors);
};
