/**
 * `GET /v1/destinations/{id}/guides` (docs/api-contracts.md §5.5): a destination's local tour
 * guides, as the guides loader stored them (`local_guides`, listed rows only through RLS). Each
 * comes with what the guide publishes to sell their guiding, the summary of their public
 * reputation in the reader's language (else English), a third-party platform's rating with its
 * page and the licence flag. Best known first: the most reviewed rating, then by name. `{id}` is
 * the destination's id or slug. A destination with no guides answers an empty list.
 */
import { withUser } from '@cp/db';
import {
  GUIDE_LICENCE_STATES,
  LOCAL_GUIDE_KINDS,
  type DestinationGuidesWire,
  type LocalGuideWire,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { profileReaderLocale } from '../places/profile';
import { resolveDestination } from '../travel-data/destination-ref';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

const priceSchema = z.object({ text: z.string(), source_url: z.string().nullable().catch(null) });
const ratingSchema = z.object({
  value: z.number(),
  count: z.number().int(),
  platform: z.string(),
  url: z.string(),
});

interface GuideRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly languages: string[];
  readonly specialties: string[];
  readonly areas: string[];
  readonly price: unknown;
  readonly profile_url: string;
  readonly review_summary: Record<string, unknown>;
  readonly rating: unknown;
  readonly licensed: string;
}

/** One stored guide as a reader of `locale` sees it; null for a row without an English summary. */
export function guideWire(row: GuideRow, locale: string): LocalGuideWire | null {
  const own = row.review_summary[locale];
  const english = row.review_summary['en'];
  const summary = typeof own === 'string' && own !== '' ? own : english;
  if (typeof summary !== 'string' || summary === '') return null;
  return {
    id: row.id,
    name: row.name,
    kind: LOCAL_GUIDE_KINDS.find((kind) => kind === row.kind) ?? 'individual',
    languages: row.languages,
    specialties: row.specialties,
    areas: row.areas,
    price: priceSchema.safeParse(row.price).data ?? null,
    profile_url: row.profile_url,
    review_summary: summary,
    review_summary_locale: summary === own ? locale : 'en',
    rating: ratingSchema.safeParse(row.rating).data ?? null,
    licensed: GUIDE_LICENCE_STATES.find((state) => state === row.licensed) ?? 'unknown',
  };
}

export function registerDestinationGuidesRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/destinations/:id/guides', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      const locale = await profileReaderLocale(tx, uid);
      const { rows } = await tx.query<GuideRow>(
        `SELECT id, name, kind, languages, specialties, areas, price, profile_url, review_summary,
                rating, licensed
           FROM local_guides
          WHERE destination_id = $1 AND status = 'listed'
          ORDER BY (rating->>'count')::int DESC NULLS LAST, name, id`,
        [destination.id],
      );
      const answer: DestinationGuidesWire = {
        destination_id: destination.id,
        guides: rows.flatMap((row) => guideWire(row, locale) ?? []),
      };
      return answer;
    });
    return sendSharedContent(c, body);
  });
}
