/**
 * `GET /v1/destinations/{id}/links` (docs/api-contracts.md §5.5): the day trips a visitor makes
 * from a destination and the cities a trip goes on to, in the order the brief ranks them, each
 * with how long the journey takes, how it is made and what it costs. `destination_links` is not
 * synced, so this is how a phone reads it. A written row is an estimate (`estimate: true`) and
 * carries the pages it came from; an editor's row does not. `{id}` is the destination's id or
 * slug. A destination with no links yet queues its links run, at most once a day.
 */
import { sendInTx, withUser } from '@cp/db';
import { PLACES_QUEUES } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { profileReaderLocale } from '../places/profile';
import { resolveDestination } from '../travel-data/destination-ref';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface TravelSource {
  readonly url: string;
  readonly title: string;
  readonly quote: string;
}

export interface DestinationLink {
  readonly id: string;
  readonly kind: 'day_trip' | 'onward';
  readonly to: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly coverage: string;
  };
  /** One way. */
  readonly minutes: number;
  readonly mode: string;
  readonly day_length: 'half' | 'full' | null;
  readonly essential: boolean;
  readonly cost_pp_minor: number | null;
  readonly cost_currency: string | null;
  readonly note: string | null;
  readonly estimate: boolean;
  readonly sources: readonly TravelSource[];
}

export interface DestinationLinks {
  readonly destination_id: string;
  readonly links: readonly DestinationLink[];
}

interface LinkRow {
  id: string;
  kind: 'day_trip' | 'onward';
  to_id: string;
  to_slug: string;
  to_name: string;
  to_coverage: string;
  minutes: number;
  mode: string;
  day_length: 'half' | 'full' | null;
  essential: boolean | null;
  cost_pp_minor: string | null;
  cost_currency: string | null;
  note: string | null;
  origin: string;
  sources: TravelSource[];
}

const LINKS_RUN_RETRY_SECONDS = 24 * 3_600;

export function registerDestinationLinksRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/destinations/:id/links', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      const locale = await profileReaderLocale(tx, uid);
      const { rows } = await tx.query<LinkRow>(
        `SELECT l.id, l.kind, d.id AS to_id, d.slug AS to_slug, d.name AS to_name,
                d.coverage AS to_coverage, l.minutes, l.mode, l.day_length, l.essential,
                l.cost_pp_minor::text, l.cost_currency,
                coalesce(nullif(l.i18n->$2->>'note', ''), l.note) AS note, l.origin, l.sources
           FROM destination_links l JOIN destinations d ON d.id = l.to_destination_id
          WHERE l.from_destination_id = $1
          ORDER BY (l.kind = 'onward'), l.position, d.name, l.id`,
        [destination.id, locale],
      );
      if (rows.length === 0) {
        await sendInTx(
          tx,
          PLACES_QUEUES.destinationBrief,
          { destination_id: destination.id },
          {
            singletonKey: `links:${destination.id}`,
            singletonSeconds: LINKS_RUN_RETRY_SECONDS,
          },
        );
      }
      const links: DestinationLinks = {
        destination_id: destination.id,
        links: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          to: { id: row.to_id, slug: row.to_slug, name: row.to_name, coverage: row.to_coverage },
          minutes: row.minutes,
          mode: row.mode,
          day_length: row.day_length,
          essential: row.essential === true,
          cost_pp_minor: row.cost_pp_minor === null ? null : Number(row.cost_pp_minor),
          cost_currency: row.cost_currency,
          note: row.note,
          estimate: row.origin !== 'editorial',
          sources: row.sources,
        })),
      };
      return links;
    });
    return sendSharedContent(c, body);
  });
}
