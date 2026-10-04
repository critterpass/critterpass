/** The places hub module: Tokek's ranked suggestions, mounted from the planning aggregator. */
import { createPlanningProvider } from '../../routing/planning-provider';
import { planningFitTravel } from '../../routing/travel-modes';
import type { PlanningModule } from '../register';
import { tripStaySource } from '../stay';
import { registerSuggestRoute } from './suggest-route';

export const placesHubModule: PlanningModule = ({ app, doors, env }) => {
  registerSuggestRoute(app, doors, {
    stays: tripStaySource,
    travel: planningFitTravel(
      createPlanningProvider({ valhallaUrl: env.VALHALLA_URL, pool: doors.pool }),
    ),
    now: () => new Date(),
  });
};
