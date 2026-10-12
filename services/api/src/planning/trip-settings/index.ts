/**
 * A trip's settings on the api: who may change the plan, moving a planned trip to new dates, and
 * what new dates or cancelling would do, and the caller's own days for the free-days preview.
 */
import type { PlanningModule } from '../register';
import { changeTripDatesCommand } from './change-trip-dates';
import { registerMyDaysRead } from './my-days';
import { registerTripSettingsReads } from './reads';
import { setPlanChangeRuleCommand } from './set-plan-change-rule';

export const tripSettingsModule: PlanningModule = ({ app, doors }) => {
  doors.registry.register(setPlanChangeRuleCommand);
  doors.registry.register(changeTripDatesCommand);
  registerTripSettingsReads(app, doors);
  registerMyDaysRead(app, doors);
};
