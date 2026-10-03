/**
 * The silent per-user daily caps of the planning model calls (`fair_use.search_parse_per_day`,
 * `fair_use.link_import_per_day`): each call bumps `fair_use_counters` for the UTC day, and a call
 * past the cap answers without the model instead of an error. Caps are server config, with the
 * planning defaults when unset.
 */
import { PLANNING_CONFIG_DEFAULTS } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

type Metric = 'search_parse' | 'link_import';

const CAP_KEYS = {
  search_parse: 'fair_use.search_parse_per_day',
  link_import: 'fair_use.link_import_per_day',
} as const satisfies Record<Metric, keyof typeof PLANNING_CONFIG_DEFAULTS>;

/** Reads one planning config value as the system role, else its default. */
export async function readPlanningConfig(tx: pg.PoolClient, key: string): Promise<unknown> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [key]),
  );
  return rows[0]?.value;
}

const utcDayStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Counts one call; true while the caller is within the day's cap. */
export async function bumpPlanningFairUse(
  tx: pg.PoolClient,
  uid: string,
  metric: Metric,
  now: Date,
): Promise<boolean> {
  const key = CAP_KEYS[metric];
  const configured = Number(await readPlanningConfig(tx, key));
  const cap =
    Number.isInteger(configured) && configured >= 0 ? configured : PLANNING_CONFIG_DEFAULTS[key];
  const { rows } = await tx.query<{ bump: { count: number; cap: number } }>(
    'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump',
    [uid, metric, utcDayStart(now), cap],
  );
  const bump = rows[0]?.bump;
  return bump === undefined || bump.count <= bump.cap;
}
