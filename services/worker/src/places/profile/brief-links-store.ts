/**
 * Reads and writes for a destination's links run: the run's own record (`destination_link_runs`),
 * the place each link leads to, and the `destination_links` rows (origin 'ai', each with its
 * sources; D30). A link leads to a destination we have, or, for a day trip, to a new day-trip
 * area (`coverage = 'area'`) under the base city's set, with its time zone and currency. A row an
 * editor wrote is never replaced.
 */
import type { BriefLinkLead, TravelCost } from '@cp/ai';
import { assertCurrencyCode, currencyExponent } from '@cp/cost-engine';
import { withSystem } from '@cp/db';
import type pg from 'pg';

/** Links are looked for again after this; a run that found none, sooner. */
export const LINKS_TTL_DAYS = 90;
export const LINKS_RETRY_DAYS = 14;

export interface LinksTarget {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly currency: string | null;
  readonly tz: string | null;
  readonly coverage: string;
  readonly setId: string | null;
  readonly setCode: string | null;
  readonly runStatus: string | null;
  readonly runExpiresAt: Date | null;
}

export async function loadLinksTarget(pool: pg.Pool, id: string): Promise<LinksTarget | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      slug: string;
      name: string;
      country: string | null;
      currency: string | null;
      tz: string | null;
      coverage: string;
      set_id: string | null;
      set_code: string | null;
      run_status: string | null;
      run_expires_at: Date | null;
    }>(
      `SELECT d.id, d.slug, d.name, d.country, d.currency, d.tz, d.coverage,
              s.id AS set_id, s.code AS set_code, r.status AS run_status,
              r.expires_at AS run_expires_at
         FROM destinations d
         LEFT JOIN critter_sets s ON s.id = d.critter_set_id
         LEFT JOIN destination_link_runs r ON r.destination_id = d.id
        WHERE d.id = $1`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      country: row.country,
      currency: row.currency,
      tz: row.tz,
      coverage: row.coverage,
      setId: row.set_id,
      setCode: row.set_code,
      runStatus: row.run_status,
      runExpiresAt: row.run_expires_at,
    };
  });
}

export async function markLinksStarted(pool: pg.Pool, id: string, now: Date): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO destination_link_runs (destination_id, status, requested_at, updated_at)
       VALUES ($1, 'pending', $2, $2)
       ON CONFLICT (destination_id) DO UPDATE
          SET requested_at = $2, updated_at = $2, error = NULL, cost_micros = 0`,
      [id, now],
    ),
  );
}

export interface LinksRunEnd {
  readonly status: 'ready' | 'declined' | 'failed';
  readonly links: number;
  readonly dropped: readonly unknown[];
  readonly error: string | null;
  readonly model: string | null;
  readonly costMicros: number;
}

/** Ends a run; a failed one is tried again by the next job. */
export async function markLinksEnded(
  tx: pg.PoolClient,
  id: string,
  end: LinksRunEnd,
  now: Date,
): Promise<void> {
  const days =
    end.status === 'ready' ? LINKS_TTL_DAYS : end.status === 'declined' ? LINKS_RETRY_DAYS : 0;
  await tx.query(
    `UPDATE destination_link_runs
        SET status = $2, links = $3, dropped = $4, error = $5, model = coalesce($6, model),
            cost_micros = cost_micros + $7, checked_at = $8::timestamptz,
            expires_at = $8::timestamptz + make_interval(days => $9::int), updated_at = $8
      WHERE destination_id = $1`,
    [
      id,
      end.status,
      end.links,
      JSON.stringify(end.dropped),
      end.error,
      end.model,
      end.costMicros,
      now,
      days,
    ],
  );
}

export const areaSlugPart = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

interface PlaceRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly currency: string | null;
  readonly tz: string | null;
  readonly coverage: string;
}

export type LinkEnd = { readonly id: string; readonly slug: string } | { readonly dropped: string };

/**
 * The destination a link leads to. One we have is matched by name or slug among the base city's
 * country; a day trip to a place we lack becomes an area row, unless one of the city's own places
 * carries that name (a sight inside the destination is not a day trip). An onward link never
 * makes a row, and a day trip never crosses a time zone or a currency.
 */
export async function resolveLinkEnd(
  tx: pg.PoolClient,
  from: LinksTarget,
  lead: BriefLinkLead,
): Promise<LinkEnd> {
  const names = [lead.to, lead.toLocal].flatMap((n) => (n === null ? [] : [areaSlugPart(n)]));
  const parts = names.filter((part) => part.length >= 2);
  if (parts.length === 0) return { dropped: 'bad_name' };
  const slugs = [
    ...parts,
    ...(from.setCode === null ? [] : parts.map((p) => `${from.setCode}-${p}`)),
  ];
  const { rows } = await tx.query<PlaceRow>(
    `SELECT d.id, d.slug, d.name, d.currency, d.tz, d.coverage FROM destinations d
      WHERE d.id <> $1
        AND (d.slug = ANY($2::text[])
          OR ((d.country IS NOT DISTINCT FROM $3 OR d.critter_set_id IS NOT DISTINCT FROM $4)
              AND trim(BOTH '-' FROM regexp_replace(
                    app.unaccent_immutable(lower(d.name)), '[^a-z0-9]+', '-', 'g')) = ANY($5::text[])))
      ORDER BY (d.coverage = 'area'), d.slug LIMIT 1`,
    [from.id, slugs, from.country, from.setId, parts],
  );
  const found = rows[0];
  if (found !== undefined) {
    if (lead.kind === 'onward' && found.coverage === 'area') return { dropped: 'onward_to_area' };
    const differs =
      (found.tz !== null && from.tz !== null && found.tz !== from.tz) ||
      (found.currency !== null && from.currency !== null && found.currency !== from.currency);
    if (lead.kind === 'day_trip' && differs) return { dropped: 'crosses_zone_or_currency' };
    return { id: found.id, slug: found.slug };
  }
  if (lead.kind === 'onward') return { dropped: 'unknown_destination' };
  if (from.setCode === null || from.setId === null) return { dropped: 'no_set_for_area' };
  const inside = await tx.query(
    `SELECT 1 FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND (trim(BOTH '-' FROM regexp_replace(
               app.unaccent_immutable(lower(p.name)), '[^a-z0-9]+', '-', 'g')) = ANY($2::text[])
          OR trim(BOTH '-' FROM regexp_replace(
               app.unaccent_immutable(lower(coalesce(p.name_local, ''))), '[^a-z0-9]+', '-', 'g'))
             = ANY($2::text[]))
      LIMIT 1`,
    [from.id, parts],
  );
  if ((inside.rowCount ?? 0) > 0) return { dropped: 'inside_destination' };
  const slug = `${from.setCode}-${parts[0]}`;
  const area = await tx.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz, critter_set_id)
     VALUES ($1, $2, $3, 'area', $4, $5, $6)
     ON CONFLICT (slug) DO NOTHING RETURNING id`,
    [slug, lead.to, from.country, from.currency, from.tz, from.setId],
  );
  const id = area.rows[0]?.id;
  return id === undefined ? { dropped: 'slug_taken' } : { id, slug };
}

/** Major units as whole minor units, or null for a currency the cost engine does not know. */
export function costMinor(cost: TravelCost | null): { minor: number; currency: string } | null {
  if (cost === null) return null;
  try {
    const exponent = currencyExponent(assertCurrencyCode(cost.currency));
    return { minor: Math.round(cost.amount * 10 ** exponent), currency: cost.currency };
  } catch {
    return null;
  }
}

const noteI18n = (
  note: Readonly<Record<string, string>>,
): Record<string, { note: string }> | null => {
  const entries = Object.entries(note).filter(([locale]) => locale !== 'en');
  return entries.length === 0
    ? null
    : Object.fromEntries(entries.map(([locale, line]) => [locale, { note: line }]));
};

export interface ResolvedLink {
  readonly lead: BriefLinkLead;
  readonly to: { readonly id: string; readonly slug: string };
}

/**
 * Writes the run's links over the destination's written ones (an editor's row stays as it is, and
 * written links the run no longer found go). An onward link is also written the other way round
 * where that direction has no row yet: the journey back takes as long.
 */
export async function saveLinks(
  tx: pg.PoolClient,
  from: LinksTarget,
  links: readonly ResolvedLink[],
): Promise<number> {
  let written = 0;
  const keys: string[] = [];
  for (const [position, { lead, to }] of links.entries()) {
    const cost = costMinor(lead.cost);
    const row = (fromId: string, toId: string, key: string) => [
      key,
      fromId,
      toId,
      lead.kind,
      lead.minutes,
      lead.mode,
      lead.dayLength,
      lead.kind === 'day_trip' ? lead.essential : null,
      cost?.minor ?? null,
      cost?.currency ?? null,
      lead.note['en'] ?? null,
      JSON.stringify(noteI18n(lead.note)),
      position,
      JSON.stringify(lead.sources),
    ];
    const insert = `INSERT INTO destination_links
        (key, from_destination_id, to_destination_id, kind, minutes, mode, day_length, essential,
         cost_pp_minor, cost_currency, note, i18n, position, origin, sources)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, 'ai', $14::jsonb)
      ON CONFLICT (from_destination_id, to_destination_id, kind)`;
    const key = `${from.slug}>${to.slug}:${lead.kind}`;
    const result = await tx.query(
      `${insert} DO UPDATE
          SET key = EXCLUDED.key, minutes = EXCLUDED.minutes, mode = EXCLUDED.mode,
              day_length = EXCLUDED.day_length, essential = EXCLUDED.essential,
              cost_pp_minor = EXCLUDED.cost_pp_minor, cost_currency = EXCLUDED.cost_currency,
              note = EXCLUDED.note, i18n = EXCLUDED.i18n, position = EXCLUDED.position,
              sources = EXCLUDED.sources
        WHERE destination_links.origin = 'ai'`,
      row(from.id, to.id, key),
    );
    written += result.rowCount ?? 0;
    keys.push(key);
    if (lead.kind === 'onward') {
      await tx.query(
        `${insert} DO NOTHING`,
        row(to.id, from.id, `${to.slug}>${from.slug}:${lead.kind}`),
      );
    }
  }
  if (keys.length > 0) {
    await tx.query(
      `DELETE FROM destination_links
        WHERE from_destination_id = $1 AND origin = 'ai' AND key <> ALL($2::text[])`,
      [from.id, keys],
    );
  }
  return written;
}
