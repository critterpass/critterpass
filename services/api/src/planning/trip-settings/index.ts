/**
 * A trip's settings on the api: who may change the plan, moving a planned trip to new dates, and
 * what new dates or cancelling would do.
 */
import type { PlanningModule } from '../register';
import { changeTripDatesCommand } from './change-trip-dates';
import { registerTripSettingsReads } from './reads';
import { setPlanChangeRuleCommand } from './set-plan-change-rule';

export const tripSettingsModule: PlanningModule = ({ app, doors }) => {
  doors.registry.register(setPlanChangeRuleCommand);
  doors.registry.register(changeTripDatesCommand);
  registerTripSettingsReads(app, doors);
};
