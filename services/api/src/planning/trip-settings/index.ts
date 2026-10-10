/** A trip's settings on the api: who may change the plan, and what new dates or cancelling do. */
import type { PlanningModule } from '../register';
import { setPlanChangeRuleCommand } from './set-plan-change-rule';

export const tripSettingsModule: PlanningModule = ({ doors }) => {
  doors.registry.register(setPlanChangeRuleCommand);
};
