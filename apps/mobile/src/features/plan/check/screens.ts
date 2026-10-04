/**
 * The plan check's screens in the registry: `7h-1` (`tripId`), Fill a gap `7h-2` (`tripId`, `dayId`
 * or `day`, `start`/`end` as HH:MM or `from`/`to` as minutes), Less driving `7h-3` and Rain and
 * crowds `7h-4` (`tripId`, `dayId`), and Balance the crew `7h-5` (`tripId`, organisers only).
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { checkRoutes } from './routes';

const param = (params: ScreenParams, key: string) => params[key] ?? '';

/** A window edge as `HH:MM`: given so (`start`, `end`) or as minutes of the day (`from`, `to`). */
function clockParam(params: ScreenParams, clock: string, minutes: string): string {
  const given = params[clock];
  if (given !== undefined) return given;
  const minute = Number(params[minutes]);
  if (!Number.isFinite(minute)) return '';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** A day's fixer, or the plan check when the caller has no day id to give. */
const dayScreen =
  (route: (tripId: string, dayId: string) => ReturnType<typeof checkRoutes.check>) =>
  (params: ScreenParams) =>
    params['dayId'] === undefined
      ? checkRoutes.check(param(params, 'tripId'))
      : route(param(params, 'tripId'), params['dayId']);

registerScreens({
  '7h-1': (params: ScreenParams) => checkRoutes.check(param(params, 'tripId')),
  '7h-2': (params: ScreenParams) =>
    checkRoutes.gap(param(params, 'tripId'), {
      dayId: param(params, 'dayId'),
      day: param(params, 'day'),
      start: clockParam(params, 'start', 'from'),
      end: clockParam(params, 'end', 'to'),
    }),
  '7h-3': dayScreen(checkRoutes.lessDriving),
  '7h-4': dayScreen(checkRoutes.rain),
  '7h-5': (params: ScreenParams) => checkRoutes.balance(param(params, 'tripId')),
});
