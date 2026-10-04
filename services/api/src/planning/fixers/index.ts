/** The plan check's fixers: their routes and commands, mounted from the planning aggregator. */
import { registerCheckCommands } from '../../commands/checks';
import type { PlanningModule } from '../register';
import { tripStaySource } from '../stay';
import type { FixerDeps } from './check-input';
import { registerFixerRoutes } from './routes';

export const fixersModule: PlanningModule = ({ app, doors }) => {
  const deps: FixerDeps = { stays: tripStaySource, now: () => new Date() };
  registerFixerRoutes(app, doors, deps);
  registerCheckCommands(doors.registry, deps);
};
