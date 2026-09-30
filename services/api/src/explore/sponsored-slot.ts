/**
 * The sponsored slot of an Explore list (docs/product-decisions.md §3 `sponsored(u,t)`, §7):
 * shown only while `explore.sponsored` is on and `sponsored(u,t) = ¬passPlus(u) ∧ ¬boostActive(t)`
 * holds for the viewer (and the trip in context), at most one per list, chosen by destination, list
 * and category only (never by who is looking). The slot carries our own place data and the
 * partner's name: never the partner's content, which stays uncached and out of every payload.
 */
import { sponsored } from '@cp/entitlements';
import type { PoiCategory, SponsoredListKind } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';

export const SPONSORED_FLAG_KEY = 'explore.sponsored';

export interface SponsoredPick {
  readonly placement_id: string;
  readonly partner: string;
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  /** The app words the label and the "Why am I seeing this?" sheet from this key. */
  readonly disclosure: 'sponsored_contextual';
}

async function flagOn(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM client_config WHERE key = $1',
    [SPONSORED_FLAG_KEY],
  );
  return rows[0]?.value === true;
}

/** `sponsored(u,t)` for the caller (`app.uid()`), with the trip in context when there is one. */
export async function sponsoredEligible(
  tx: pg.PoolClient,
  tripId: string | null,
): Promise<boolean> {
  if (!(await flagOn(tx))) return false;
  const { rows: user } = await tx.query<{ pass_plus: boolean }>(
    `SELECT pass_plus AND (expires_at IS NULL OR expires_at > now()) AS pass_plus
       FROM user_entitlements WHERE user_id = app.uid()`,
  );
  const passPlus = user[0]?.pass_plus === true;
  let boost = false;
  if (tripId !== null) {
    const { rows: trip } = await tx.query<{ boost_active: boolean }>(
      'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
      [tripId],
    );
    boost = trip[0]?.boost_active === true;
  }
  return sponsored(passPlus, boost);
}

export interface SponsoredQuery {
  readonly destinationId: string;
  readonly listKind: SponsoredListKind;
  readonly category?: PoiCategory | undefined;
  /** Places already in the organic list: a placement never repeats one. */
  readonly exclude: ReadonlySet<string>;
}

/** The live placement for this list, or null; a placement past its impression cap is skipped. */
export async function pickSponsored(
  tx: pg.PoolClient,
  query: SponsoredQuery,
): Promise<SponsoredPick | null> {
  const { rows } = await tx.query<SponsoredPick & { impression_cap: number | null }>(
    `SELECT s.id AS placement_id, s.partner, p.id AS poi_id, p.name, p.category, s.impression_cap
       FROM sponsored_placements s JOIN pois p ON p.id = s.poi_id
      WHERE s.destination_id = $1 AND $2 = ANY (s.list_kinds)
        AND now() >= s.starts_at AND now() < s.ends_at
        AND ($3::text IS NULL OR cardinality(s.categories) = 0 OR $3 = ANY (s.categories))
        AND p.status = 'active' AND p.merged_into_id IS NULL
      ORDER BY s.starts_at, s.id`,
    [query.destinationId, query.listKind, query.category ?? null],
  );
  for (const row of rows) {
    if (query.exclude.has(row.poi_id)) continue;
    if (
      row.impression_cap !== null &&
      (await impressions(tx, row.placement_id)) >= row.impression_cap
    ) {
      continue;
    }
    return {
      placement_id: row.placement_id,
      partner: row.partner,
      poi_id: row.poi_id,
      name: row.name,
      category: row.category,
      disclosure: 'sponsored_contextual',
    };
  }
  return null;
}

async function impressions(tx: pg.PoolClient, placementId: string): Promise<number> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ n: string }>(
      `SELECT coalesce(sum(count), 0)::text AS n FROM sponsored_event_counts
        WHERE placement_id = $1 AND kind = 'impression'`,
      [placementId],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}
