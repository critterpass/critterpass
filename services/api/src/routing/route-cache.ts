/**
 * `route_cache` on the api's pool, as the system role (the table has no app_user grant): the
 * read-through cache planning travel reuses across requests and jobs. Rows older than 30 days are
 * ignored here and purged by `maint.purge`.
 */
import { withSystem } from '@cp/db';
import { createSqlRouteCache, type RouteCache } from '@cp/suppliers';
import type pg from 'pg';

export function poolRouteCache(pool: pg.Pool): RouteCache {
  return createSqlRouteCache((sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])));
}
