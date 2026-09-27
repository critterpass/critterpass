/**
 * `GET /v1/weather?lat&lng&from&to[&elevation_m]` and `GET /v1/weather/marine?lat&lng&from&to`
 * (docs/api-contracts.md §5.5): the cached WeatherAPI.com forecast nearest the point, with its
 * fetched and checked times, a stale flag, and the attribution link the free plan asks for.
 */
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import type { TravelDataRouteDeps } from './routes';
import { readMarine, readWeather, type WeatherWindow } from './weather-read';

/** A read covers at most this many days (the longest forecast any plan returns). */
const MAX_WINDOW_DAYS = 16;

const windowQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    elevation_m: z.coerce.number().int().min(-500).max(9000).optional(),
  })
  .refine((query) => Date.parse(query.to) >= Date.parse(query.from), { path: ['to'] })
  .refine(
    (query) => Date.parse(query.to) - Date.parse(query.from) <= MAX_WINDOW_DAYS * 86_400_000,
    {
      path: ['to'],
    },
  );

export function parseWeatherWindow(query: Record<string, string>): WeatherWindow {
  const parsed = windowQuerySchema.parse(query);
  return {
    lat: parsed.lat,
    lng: parsed.lng,
    from: new Date(parsed.from),
    to: new Date(parsed.to),
    ...(parsed.elevation_m !== undefined ? { elevationM: parsed.elevation_m } : {}),
  };
}

export function registerWeatherRoutes(app: OpenAPIHono<AppEnv>, deps: TravelDataRouteDeps): void {
  app.get('/v1/weather', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const window = parseWeatherWindow(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) => readWeather(tx, window));
    c.header('Cache-Control', 'private, max-age=3600');
    return c.json(body);
  });

  app.get('/v1/weather/marine', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const window = parseWeatherWindow(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) => readMarine(tx, window));
    c.header('Cache-Control', 'private, max-age=900');
    return c.json(body);
  });
}
