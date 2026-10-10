/** A trip's settings on the api: who may change the plan, and what new dates or cancelling do. */
import type { PlanningModule } from '../register';
import { registerTripSettingsReads } from './reads';
import { setPlanChangeRuleCommand } from './set-plan-change-rule';

export const tripSettingsModule: PlanningModule = ({ app, doors }) => {
  doors.registry.register(setPlanChangeRuleCommand);
  registerTripSettingsReads(app, doors);
};
