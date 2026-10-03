/** Stances on a place and the decision a split posts: registered from the planning aggregator. */
import type { PlanningModule } from '../../planning/register';
import { clearPlaceStanceCommand } from './clear-place-stance';
import { postPlaceDecisionCommand } from './post-place-decision';
import { setPlaceStanceCommand } from './set-place-stance';

export const stanceCommands: PlanningModule = ({ doors }) => {
  doors.registry.register(setPlaceStanceCommand);
  doors.registry.register(clearPlaceStanceCommand);
  doors.registry.register(postPlaceDecisionCommand({ redis: doors.redis }));
};
