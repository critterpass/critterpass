/**
 * Live local queries for the profile screens: a query with bound parameters runs now and again
 * whenever one of its tables changes; `null` params skip it until the uid is known. Everything
 * reads synced rows, so the profile opens with no signal. Over the app's shared hooks.
 */
import {
  liveView,
  NO_ROWS,
  quietView,
  useLiveQueryState,
  type QuietLiveRows,
} from '@/data/powersync/live-rows';
import { useSessionUid } from '@/data/powersync/use-session-uid';

export type LiveRows<Row> = QuietLiveRows<Row>;

const LOADED_EMPTY: LiveRows<never> = { rows: NO_ROWS, loaded: true };

// A table this build's local schema does not have yet reads as empty.
const emptyWhenFailed = liveView((state): LiveRows<unknown> =>
  state.failed ? LOADED_EMPTY : quietView(state),
);

export function useLiveRows<Row>(
  sql: string,
  params: readonly unknown[] | null,
  tables: readonly string[],
): LiveRows<Row> {
  return emptyWhenFailed(useLiveQueryState<Row>(sql, params, tables)) as LiveRows<Row>;
}

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  return useSessionUid();
}
