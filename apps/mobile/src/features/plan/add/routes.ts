/**
 * Add to plan's route (7f-1) and the params that preset it: a drop on a day (`day`), a fixer's
 * time (`start`, local `HH:MM`), "+ right after this stop" (`after`, its stable id), and where it
 * was opened from (`source`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and param names, never copy. */
import type { Href } from 'expo-router';

import { minutesOnDay } from '@/data/plan/plan-model';

import type { AddPreset } from './add-model';

export interface AddRouteParams {
  readonly day?: number | undefined;
  /** A plan day's id (the place page's ADD names its day this way). */
  readonly dayId?: string | undefined;
  /** "Other days" from the place page: the sheet opens on Tokek's pick, the days to choose from. */
  readonly pick?: string | undefined;
  readonly start?: string | undefined;
  readonly after?: string | undefined;
  readonly source?: string | undefined;
}

export function addRoute(tripId: string, placeId: string, params: AddRouteParams = {}): Href {
  const query = new URLSearchParams();
  if (params.day !== undefined) query.set('day', String(params.day));
  if (params.dayId !== undefined) query.set('dayId', params.dayId);
  if (params.pick !== undefined) query.set('pick', params.pick);
  if (params.start !== undefined) query.set('start', params.start);
  if (params.after !== undefined) query.set('after', params.after);
  if (params.source !== undefined) query.set('source', params.source);
  const qs = query.toString();
  return `/${tripId}/add/${placeId}${qs === '' ? '' : `?${qs}`}` as Href;
}

export interface RoutePreset extends Omit<AddPreset, 'after'> {
  /** A plan day's id, resolved to its number once the plan is read. */
  readonly dayId?: string | undefined;
  /** A start given as an instant, read on the trip's clock once the plan is read. */
  readonly startAt?: string | undefined;
}

/** The preset from the route's params; anything unreadable is left out. */
export function presetFromParams(params: {
  readonly day?: string | undefined;
  readonly dayId?: string | undefined;
  readonly start?: string | undefined;
}): RoutePreset {
  const day = Number(params.day);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(params.start ?? '');
  const instant =
    time === null && params.start !== undefined && !Number.isNaN(Date.parse(params.start))
      ? params.start
      : undefined;
  return {
    ...(Number.isInteger(day) && day > 0 ? { dayNo: day } : {}),
    ...(params.dayId === undefined || params.dayId === '' ? {} : { dayId: params.dayId }),
    ...(time === null ? {} : { startMin: Number(time[1]) * 60 + Number(time[2]) }),
    ...(instant === undefined ? {} : { startAt: instant }),
  };
}

/** A day named by its id and a start named as an instant, as the plan reads them. */
export function resolvePreset(
  route: RoutePreset,
  dayRows: readonly {
    readonly id: string;
    readonly day_no: number;
    readonly date: string | null;
  }[],
  tz: string,
): Omit<AddPreset, 'after'> {
  const byId = dayRows.find((row) => row.id === route.dayId);
  const dayNo = route.dayNo ?? byId?.day_no;
  const date = dayRows.find((row) => row.day_no === dayNo)?.date ?? null;
  const startMin =
    route.startMin ??
    (route.startAt === undefined || date === null
      ? undefined
      : minutesOnDay(route.startAt, tz, date));
  return {
    ...(dayNo === undefined ? {} : { dayNo }),
    ...(startMin === undefined ? {} : { startMin }),
  };
}

interface NavRoute {
  readonly params?: object | undefined;
  readonly state?: NavState | undefined;
}

interface NavState {
  readonly routes?: readonly NavRoute[] | undefined;
}

/**
 * The plan day the sheet was opened from: the screen right under it, when that screen is about
 * one day (search opened "for Thu" from that day's plan). A day-scoped screen further down the
 * stack does not count: she has since moved on from it.
 */
export function originDayId(state: NavState | undefined): string | undefined {
  // The stack the sheet is on: follow the newest screen down while it holds a stack of its own.
  let routes = state?.routes ?? [];
  for (let top = routes.at(-1); top?.state?.routes !== undefined; top = routes.at(-1)) {
    routes = top.state.routes;
  }
  const params = (routes.at(-2)?.params ?? {}) as { scope?: unknown; day_id?: unknown };
  return params.scope === 'day' && typeof params.day_id === 'string' && params.day_id !== ''
    ? params.day_id
    : undefined;
}
