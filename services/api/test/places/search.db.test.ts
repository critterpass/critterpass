/**
 * Plain-words place search on the real schema, over a Bali trip staying at a villa in Ubud with
 * Wednesday's dinner booked: "quiet dinner near the villa, open late" (7d-2) answers six places and
 * three that break one chip, with minutes, closing times and fits that leave Wednesday out;
 * "omakase sushi in ubud" (7d-4) answers nothing and ways out whose counts are what tapping them
 * returns. A request with none of the new parameters answers exactly the shape it always had.
 */
import { DomainError, placeFitSchema } from '@cp/domain';
import { OpenAPIHono } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { AppEnv } from '../../src/app';
import { registerPlacesRoutes } from '../../src/places/routes';
import {
  JAPANESE_IN_UBUD,
  LOUDER_OR_FURTHER,
  NOT_DINNER,
  OMAKASE,
  QUIET_DINNERS,
  startBaliTrip,
  type BaliTrip,
} from '../planning/search/bali-fixture';

let bali: BaliTrip;
let app: OpenAPIHono<AppEnv>;

beforeAll(async () => {
  bali = await startBaliTrip([
    ...QUIET_DINNERS,
    ...LOUDER_OR_FURTHER,
    ...NOT_DINNER,
    ...OMAKASE,
    ...JAPANESE_IN_UBUD,
  ]);
  app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    const uid = c.req.header('x-test-uid');
    if (uid !== undefined) c.set('uid', uid);
    await next();
  });
  registerPlacesRoutes(app, { pool: bali.pool, valhallaUrl: undefined });
  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return c.json(error.toResponseBody(), error.http as never);
    }
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION' } }, 422);
    return c.json({ error: { code: 'INTERNAL', message: String(error) } }, 500);
  });
}, 240_000);

afterAll(async () => {
  await bali?.stop();
});

interface Item {
  id: string;
  name: string;
  area: string | null;
  minutes: { value: number; mode: string; approx: boolean } | null;
  closesAt: string | null;
  fit?: unknown;
}
interface Body {
  results: Item[];
  soft_misses: Item[];
  ways_out?: {
    kind: string;
    label_params: Record<string, unknown>;
    count: number;
    areas: string[];
    open_late?: number;
  }[];
  nearest?: { poi_id: string; name: string; area: string | null; minutes: number } | null;
}

async function search(params: Record<string, string>, uid = bali.organiser) {
  const response = await app.request(
    `http://localhost/v1/places/search?${new URLSearchParams(params).toString()}`,
    { headers: { 'x-test-uid': uid } },
  );
  return { status: response.status, body: (await response.json()) as Body };
}

const wednesday = () => bali.dayIds[2] ?? '';

const QUIET_DINNER = () => ({
  trip_id: bali.tripId,
  meal: 'dinner',
  attrs: 'quiet',
  max_minutes: 'stay:15',
  open_past: '22:00',
  exclude_day_ids: wednesday(),
});

describe('GET /v1/places/search with plain-words filters', () => {
  it('finds six quiet dinners near the villa open past 22:00, and three louder or further', async () => {
    const { status, body } = await search(QUIET_DINNER());
    expect(status).toBe(200);
    expect(body.results.map((item) => item.name).sort()).toEqual(
      QUIET_DINNERS.map((place) => place.name).sort(),
    );
    expect(body.soft_misses.map((item) => item.name).sort()).toEqual(
      LOUDER_OR_FURTHER.map((place) => place.name).sort(),
    );
    for (const item of body.results) {
      expect(item.minutes?.value).toBeLessThanOrEqual(15);
      expect(item.minutes?.approx).toBe(true);
      expect(item.area).toBe('Ubud');
      expect((item.closesAt ?? '') >= '22:30').toBe(true);
    }
    expect(body.results.find((item) => item.name === "Murni's Warung")?.closesAt).toBe('22:30');
    expect(body.ways_out).toBeUndefined();
  });

  it('brings the Wednesday-only late place back when Wednesday is not left out', async () => {
    const { exclude_day_ids: _dropped, ...rest } = QUIET_DINNER();
    const { body } = await search(rest);
    expect(body.results.map((item) => item.name)).toContain('Wednesday Supper Club');
  });

  it('fits each place on the days not left out, and its best day is one of them', async () => {
    const { body } = await search({ ...QUIET_DINNER(), fit: '1' });
    for (const item of [...body.results, ...body.soft_misses]) {
      const fit = placeFitSchema.parse(item.fit);
      expect(fit.days.map((day) => day.day_id)).not.toContain(wednesday());
      expect(fit.days).toHaveLength(5);
      if (fit.best !== null) expect(fit.best.day_id).not.toBe(wednesday());
    }
  });

  it('answers ways out for omakase in Ubud whose counts are what tapping them returns', async () => {
    const base = {
      trip_id: bali.tripId,
      q: 'omakase sushi',
      categories: 'food',
      max_minutes: 'stay:30',
    };
    const { body } = await search({ ...base, relax: '1' });
    expect(body.results).toEqual([]);
    expect(body.ways_out?.map((way) => way.kind)).toEqual(['widen', 'related', 'pin']);
    const [widen, related, pin] = body.ways_out ?? [];
    expect(widen).toMatchObject({ label_params: { minutes: 90 }, count: 3 });
    expect(widen?.areas.sort()).toEqual(['Canggu', 'Seminyak']);
    expect(related).toMatchObject({
      label_params: { term: 'japanese' },
      count: 4,
      areas: ['Ubud'],
      open_late: 2,
    });
    expect(pin).toEqual({ kind: 'pin', label_params: {}, count: 0, areas: [] });
    expect(body.nearest).toMatchObject({ name: 'Hiroshi Omakase', area: 'Seminyak' });
    expect(body.nearest?.minutes).toBeGreaterThan(60);
    expect(body.nearest?.minutes).toBeLessThan(90);

    const widened = await search({ ...base, max_minutes: 'stay:90' });
    expect(widened.body.results).toHaveLength(3);
    const japanese = await search({ ...base, q: 'japanese' });
    expect(japanese.body.results.map((item) => item.name).sort()).toEqual(
      JAPANESE_IN_UBUD.map((place) => place.name).sort(),
    );
  });

  it('is NOT_FOUND for a trip the caller is not on', async () => {
    expect((await search(QUIET_DINNER(), bali.outsider)).status).toBe(404);
  });

  it('rejects a malformed minutes limit', async () => {
    expect((await search({ ...QUIET_DINNER(), max_minutes: 'villa:15' })).status).toBe(422);
  });
});

describe('GET /v1/places/search without plain-words filters', () => {
  it('answers exactly the keys it always had', async () => {
    const { status, body } = await search({ destination_id: bali.destinationId, q: 'Sayan' });
    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(['results']);
    expect(body.results.length).toBeGreaterThan(0);
    for (const item of body.results) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'id',
          'name',
          'nameLocal',
          'category',
          'lat',
          'lng',
          'address',
          'priceLevel',
          'tags',
          'distanceM',
          'openNow',
        ].sort(),
      );
    }
  });
});
