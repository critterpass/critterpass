/**
 * Add to plan's route (7f-1) and the params that preset it: a drop on a day (`day`), a fixer's
 * time (`start`, local `HH:MM`), "+ right after this stop" (`after`, its stable id), and where it
 * was opened from (`source`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and param names, never copy. */
import type { Href } from 'expo-router';

import type { AddPreset } from './add-model';

export interface AddRouteParams {
  readonly day?: number | undefined;
  readonly start?: string | undefined;
  readonly after?: string | undefined;
  readonly source?: string | undefined;
}

export function addRoute(tripId: string, placeId: string, params: AddRouteParams = {}): Href {
  const query = new URLSearchParams();
  if (params.day !== undefined) query.set('day', String(params.day));
  if (params.start !== undefined) query.set('start', params.start);
  if (params.after !== undefined) query.set('after', params.after);
  if (params.source !== undefined) query.set('source', params.source);
  const qs = query.toString();
  return `/${tripId}/add/${placeId}${qs === '' ? '' : `?${qs}`}` as Href;
}

/** The preset from the route's params; anything unreadable is left out. */
export function presetFromParams(params: {
  readonly day?: string | undefined;
  readonly start?: string | undefined;
}): Omit<AddPreset, 'after'> {
  const day = Number(params.day);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(params.start ?? '');
  return {
    ...(Number.isInteger(day) && day > 0 ? { dayNo: day } : {}),
    ...(time === null ? {} : { startMin: Number(time[1]) * 60 + Number(time[2]) }),
  };
}
