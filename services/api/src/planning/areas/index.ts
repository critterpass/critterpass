/** A trip's areas on the api: a day spent in a day-trip area, and the stops of the trip. */
import type { PlanningModule } from '../register';
import { clearDayAreaCommand } from './clear-day-area';
import { setDayAreaCommand } from './set-day-area';
import { setTripStopsCommand } from './set-trip-stops';

export const areasModule: PlanningModule = ({ doors }) => {
  doors.registry.register(setDayAreaCommand);
  doors.registry.register(clearDayAreaCommand);
  doors.registry.register(setTripStopsCommand);
};
