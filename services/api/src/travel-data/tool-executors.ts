/**
 * Travel-data AI tool executors (docs/api-contracts.md §6): numbers come from the cached tables
 * only, never from the model, and a missing or stale value is left out rather than guessed.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import { iataCodeSchema, monthKeySchema, type WeatherAlert } from '@cp/domain';
import type pg from 'pg';

import { readCrowds } from './crowds-route';
import { resolveDestination } from './destination-ref';
import { readFares } from './fares-read';
import { convertWithSnapshots } from './fx';
import { readMarine, readWeather } from './weather-read';

/** Alerts with a known window, in the tool's shape. */
function toolAlerts(alerts: readonly WeatherAlert[]) {
  return alerts.flatMap((alert) =>
    alert.from === null || alert.to === null
      ? []
      : [{ kind: alert.kind, severity: alert.severity, from: alert.from, to: alert.to }],
  );
}

function readAs<T>(pool: pg.Pool, context: ToolContext, fn: (tx: pg.PoolClient) => Promise<T>) {
  return withUser(pool, context.uid, 'guide', fn);
}

export function registerTravelDataToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  // "~$X (seen {time})": one entry per departure day with a fresh price; a borrowed hub fare is
  // reported under the hub's code so the guide never presents it as the origin's own.
  registry.registerToolExecutor('fare_calendar', (input, context) =>
    readAs(pool, context, async (tx) => {
      const destination = await resolveDestination(tx, input.dest);
      const destIata = destination.travel?.airports[0];
      if (destIata === undefined) return [];
      const fares = await readFares(tx, {
        origins: input.origins.map((origin) => iataCodeSchema.parse(origin.toUpperCase())),
        destIata,
        month: monthKeySchema.parse(input.month),
      });
      return fares.flatMap((fare) =>
        fare.state !== 'ok' || fare.seen_at === null
          ? []
          : fare.days.map((day) => ({
              origin: fare.via_hub ?? fare.origin,
              date: day.depart_on,
              price_minor: day.price_minor,
              currency: fare.currency,
              seen_at: fare.seen_at as string,
            })),
      );
    }),
  );

  // No hourly source yet: hourly and best_window stay null and the month level stands in.
  registry.registerToolExecutor('crowd_forecast', (input, context) =>
    readAs(pool, context, async (tx) => {
      const crowds = await readCrowds(tx, input.poi_id, input.date);
      return {
        hourly: crowds.hourly === null ? null : [...crowds.hourly],
        best_window:
          crowds.best_window === null
            ? null
            : { start: crowds.best_window.start, end: crowds.best_window.end },
        month:
          crowds.month === null
            ? null
            : {
                crowd_index: crowds.month.crowd_index,
                colour_role: crowds.month.colour_role,
                highlight_tag: crowds.month.highlight_tag,
              },
      };
    }),
  );

  // Times and temperatures verbatim from the stored forecast; nothing stored nearby = an empty
  // series the guide must report as unknown.
  registry.registerToolExecutor('weather', (input, context) =>
    readAs(pool, context, async (tx) => {
      const series = await readWeather(tx, {
        lat: input.lat,
        lng: input.lng,
        from: new Date(input.from),
        to: new Date(input.to),
      });
      return {
        hourly: series.hourly.map((hour) => ({
          at: hour.at,
          temp_c: hour.temp_c,
          chance_of_rain: hour.chance_of_rain,
          precip_mm: hour.precip_mm,
          wind_kph: hour.wind_kph,
          code: String(hour.code),
        })),
        alerts: toolAlerts(series.alerts),
      };
    }),
  );
  registry.registerToolExecutor('marine', (input, context) =>
    readAs(pool, context, async (tx) => {
      const series = await readMarine(tx, {
        lat: input.lat,
        lng: input.lng,
        from: new Date(input.from),
        to: new Date(input.to),
      });
      return {
        hourly: series.hourly.map((hour) => ({
          at: hour.at,
          wave_m: hour.wave_m,
          swell_m: hour.swell_m,
          sea_temp_c: hour.water_temp_c,
        })),
        alerts: [],
      };
    }),
  );

  // Converted at the stored snapshot rate; no snapshot relating the pair = unavailable, never a
  // guessed rate.
  registry.registerToolExecutor('fx', (input, context) =>
    readAs(pool, context, async (tx) => {
      const conversion = await convertWithSnapshots(
        tx,
        input.amount_minor,
        input.from.toUpperCase(),
        input.to.toUpperCase(),
      );
      if (conversion === null)
        throw new Error(`no FX snapshot relates ${input.from} and ${input.to}`);
      return {
        amount_minor: conversion.to.amount_minor,
        rate: conversion.rate,
        snapshot_id: conversion.snapshot_id,
      };
    }),
  );
}
