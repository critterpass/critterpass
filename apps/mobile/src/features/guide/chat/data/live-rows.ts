/**
 * Synced rows as React state for the guide screens: one parameterised query, re-read whenever one
 * of its tables changes. `sql: null` reads nothing (e.g. before the thread is known), and so does
 * a cold start that restored the guide sheet before the session's local database is open. Over the
 * app's shared hooks.
 */
import { useLiveQueryState } from '@/data/powersync/live-rows';

export { watchQuery } from '@/data/powersync/live-rows';

/** `null` until the first read lands, then the rows. */
export function useLiveQuery<Row>(
  sql: string | null,
  params: readonly unknown[],
  tables: readonly string[],
): readonly Row[] | null {
  const state = useLiveQueryState<Row>(sql, params, tables);
  return state.answered ? state.rows : null;
}
