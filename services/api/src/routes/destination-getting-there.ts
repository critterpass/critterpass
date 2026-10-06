/**
 * `GET /v1/destinations/{id}/getting-there?from` (docs/api-contracts.md §5.5): the real ways to
 * reach a destination from a home city (flight, train, bus, car, boat), each an estimate of how
 * long it takes and what it costs one person, with the pages it came from. `from` is the IATA code
 * of a home airport or metro group and defaults to the caller's home airport. The answer is stored
 * per pair of places, never per traveller: the first reader of a pair queues `places.home_link`
 * and reads `pending` until the worker has written it. A stored answer past its date is still
 * served while it is written again.
 */
import { airportDataset } from '@cp/content/airports';
import { sendInTx, withUser } from '@cp/db';
import { DomainError, homeBaseFor, PLACES_QUEUES, placesHomeLinkKey } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { profileReaderLocale } from '../places/profile';
import { resolveDestination } from '../travel-data/destination-ref';
import type { TravelSource } from './destination-links';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface WayThere {
  readonly mode: string;
  /** One way. */
  readonly minutes: number;
  readonly cost_pp_minor: number | null;
  readonly cost_currency: string | null;
  readonly note: string | null;
  readonly sources: readonly TravelSource[];
}

export interface GettingThere {
  readonly destination_id: string;
  readonly origin: { readonly key: string; readonly city: string; readonly country: string };
  /** `ready`: `ways` holds estimates. `pending`: being written. `none`: no cited way was found. */
  readonly status: 'ready' | 'pending' | 'none';
  readonly ways: readonly WayThere[];
  readonly generated_at: string | null;
}

interface StoredWay extends Omit<WayThere, 'note'> {
  readonly note?: Readonly<Record<string, string>> | null;
}

export function registerDestinationGettingThereRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/destinations/:id/getting-there', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      let from = c.req.query('from')?.trim().toUpperCase();
      if (from === undefined || from === '') {
        const own = await tx.query<{ home_airport: string | null }>(
          'SELECT home_airport FROM users WHERE id = $1',
          [uid],
        );
        from = own.rows[0]?.home_airport?.toUpperCase();
      }
      if (from === undefined) throw new DomainError('VALIDATION', { reason: 'home_missing' });
      const home = homeBaseFor(airportDataset(), from);
      if (home === null || home.city === '') {
        throw new DomainError('VALIDATION', { reason: 'unknown_airport', iata: from });
      }
      const locale = await profileReaderLocale(tx, uid);
      const { rows } = await tx.query<{
        status: string;
        ways: StoredWay[];
        generated_at: Date | null;
        stale: boolean;
      }>(
        `SELECT status, ways, generated_at,
                (status = 'failed' OR (status <> 'pending' AND coalesce(expires_at <= now(), true)))
                  AS stale
           FROM destination_home_links WHERE destination_id = $1 AND origin_key = $2`,
        [destination.id, from],
      );
      const row = rows[0];
      if (row === undefined || row.stale) {
        await sendInTx(
          tx,
          PLACES_QUEUES.homeLink,
          { destination_id: destination.id, origin: from },
          { singletonKey: placesHomeLinkKey(destination.id, from) },
        );
      }
      const ways = (row?.ways ?? []).map((way) => ({
        mode: way.mode,
        minutes: way.minutes,
        cost_pp_minor: way.cost_pp_minor,
        cost_currency: way.cost_currency,
        note: way.note?.[locale] ?? way.note?.['en'] ?? null,
        sources: way.sources,
      }));
      const answer: GettingThere = {
        destination_id: destination.id,
        origin: { key: from, city: home.city, country: home.country },
        status:
          ways.length > 0
            ? 'ready'
            : row === undefined || row.stale || row.status === 'pending'
              ? 'pending'
              : 'none',
        ways,
        generated_at: row?.generated_at?.toISOString() ?? null,
      };
      return answer;
    });
    // An answer still being written is asked for again soon: it is not cached.
    if (body.status === 'pending') {
      c.header('Cache-Control', 'no-store');
      return c.json(body);
    }
    return sendSharedContent(c, body);
  });
}
