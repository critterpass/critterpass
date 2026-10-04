/**
 * Add from a link over HTTP (docs/api-contracts-planning.md, imports):
 *
 * - `GET /v1/imports/preview?url`: the clipboard card's platform, title, author and thumbnail
 *   from the platform's oEmbed only (no model), `no-store`.
 * - `POST /v1/trips/{id}/imports`: a link or a screenshot's OCR text, answered as server-sent
 *   events (`event: <name>`, `data: <json>`), participants only. Counts against the silent
 *   `link_import` cap; past it the stream is one `error{busy}`.
 *
 * Both are rate limited per user. Nothing from the post is stored.
 */
import { SSE_HEADERS } from '@cp/ai';
import { withUser } from '@cp/db';
import {
  DomainError,
  importPlatformSchema,
  importRequestSchema,
  PLANNING_CONFIG_DEFAULTS,
  type ImportEvent,
} from '@cp/domain';
import { previewLink } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../../abuse/rate-limits';
import type { AppEnv } from '../../app';
import { validationHook } from '../../commands/_framework/doors';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../../commands/_framework/session';
import { tripFitFacts } from '../fit/context';
import { areaFromAddress } from '../search/area';
import { bumpPlanningFairUse, readPlanningConfig } from '../search/fair-use';
import { runImport, type ImportDeps, type ImportJob } from './pipeline';

export interface ImportRouteDeps extends ImportDeps {
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
}

/** A paste and a retry or two; this stops a runaway client, the daily cap does the rest. */
const IMPORTS_PER_UID_RULE = { windowSeconds: 60, max: 10 };
const PREVIEWS_PER_UID_RULE = { windowSeconds: 60, max: 30 };
const AREAS_MAX = 20;

const previewQuery = z.object({ url: z.string().min(1).max(2048) });
const tripParams = z.object({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  validationHook(parsed);
  return parsed.data as T;
}

const encoder = new TextEncoder();
const frame = (event: ImportEvent) =>
  encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);

function sseResponse(events: AsyncIterator<ImportEvent> | Iterator<ImportEvent>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done === true) controller.close();
        else controller.enqueue(frame(next.value));
      } catch {
        controller.enqueue(frame({ event: 'error', data: { code: 'busy' } }));
        controller.close();
      }
    },
    async cancel() {
      await events.return?.(undefined);
    },
  });
  return new Response(stream, {
    headers: { ...SSE_HEADERS, 'cache-control': 'private, no-store, no-transform' },
  });
}

const single = (event: ImportEvent): Iterator<ImportEvent> => [event][Symbol.iterator]();

export function registerImportRoutes(app: OpenAPIHono<AppEnv>, deps: ImportRouteDeps): void {
  app.get('/v1/imports/preview', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'link_preview', uid, PREVIEWS_PER_UID_RULE);
    const { url } = parse(previewQuery, c.req.query());
    const preview = await previewLink(url, deps.readers);
    if (preview === null) throw new DomainError('VALIDATION', { reason: 'not_a_link' });
    c.header('Cache-Control', 'private, no-store');
    return c.json({
      platform: preview.platform,
      ...(preview.title === null ? {} : { title: preview.title }),
      ...(preview.author === null ? {} : { author: preview.author }),
      ...(preview.thumbUrl === null ? {} : { thumb_url: preview.thumbUrl }),
    });
  });

  app.post('/v1/trips/:id/imports', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'link_import', uid, IMPORTS_PER_UID_RULE);
    const { id } = parse(tripParams, c.req.param());
    const request = parse(importRequestSchema, await c.req.json().catch(() => undefined));
    const prepared = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const trip = await tripFitFacts(tx, id);
      if (trip.destinationId === null) return null;
      const { rows } = await tx.query<{ name: string; country: string | null }>(
        'SELECT name, country FROM destinations WHERE id = $1',
        [trip.destinationId],
      );
      const { rows: addresses } = await tx.query<{ address: string }>(
        `SELECT address FROM pois WHERE destination_id = $1 AND curation = 'editorial'
            AND address IS NOT NULL LIMIT 300`,
        [trip.destinationId],
      );
      const name = rows[0]?.name ?? '';
      const areas = [
        ...new Set(addresses.flatMap(({ address }) => areaFromAddress(address, name) ?? [])),
      ].slice(0, AREAS_MAX);
      const platforms = z
        .array(importPlatformSchema)
        .safeParse(await readPlanningConfig(tx, 'imports.platforms'));
      const within = await bumpPlanningFairUse(tx, uid, 'link_import', new Date());
      const job: ImportJob = {
        uid,
        tripId: id,
        crewId: trip.crewId,
        destinationId: trip.destinationId,
        destination: [name, rows[0]?.country].filter(Boolean).join(', '),
        areas,
        platforms: platforms.success
          ? platforms.data
          : PLANNING_CONFIG_DEFAULTS['imports.platforms'],
        request,
      };
      return { job, within };
    });
    if (prepared === null)
      return sseResponse(single({ event: 'error', data: { code: 'not_found' } }));
    if (!prepared.within) return sseResponse(single({ event: 'error', data: { code: 'busy' } }));
    return sseResponse(runImport(prepared.job, deps));
  });
}
