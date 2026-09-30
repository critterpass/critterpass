/**
 * The trip day's startup hook, imported once by the root layout: joins its screens to the
 * navigation registry and hands the session its runtime (the leave-by alarm sync and alarm
 * screen), which the layout mounts inside the signed-in session.
 */
import { registerTripDayScreens } from './routes';

registerTripDayScreens();

export { TripDayRuntime } from '../alarm/alarm-runtime';
