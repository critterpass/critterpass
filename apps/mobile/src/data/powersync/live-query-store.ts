/**
 * Live local queries: `watchQuery` runs a query now and again whenever one of its tables changes,
 * and `liveQuery` shares one such watcher and one result between everything reading the same
 * `(db, sql, params, tables)`. The shared result changes identity only when its content does: equal
 * rows keep the previous array, and unchanged rows keep their objects inside a changed one, so
 * memoised readers hold. A query nobody reads any more is released a moment later, so a screen
 * that remounts or hands over to the next one picks its rows up without a new read.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

/** The one empty result: every query with no rows (or none yet) answers with this array. */
export const NO_ROWS: readonly never[] = [];

/** How long a query with no readers keeps its watcher and rows. */
export const RELEASE_AFTER_MS = 250;

const CHANGE_THROTTLE_MS = 30;

interface Watch {
  stop(): void;
  reload(): void;
}

/**
 * A read that finishes after a newer one has answered is dropped: with several read connections
 * they can land out of order, and the newer one already saw everything the older one did.
 */
function startWatch<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError: (error: unknown) => void,
): Watch {
  const controller = new AbortController();
  let started = 0;
  let answered = 0;
  const current = (mine: number): boolean => {
    if (controller.signal.aborted || mine < answered) return false;
    answered = mine;
    return true;
  };
  const load = (): Promise<void> => {
    started += 1;
    const mine = started;
    return db.getAll<Row>(sql, [...params]).then(
      (rows) => {
        if (current(mine)) onRows(rows);
      },
      (error: unknown) => {
        if (current(mine)) onError(error);
      },
    );
  };
  void load();
  db.onChange(
    { onChange: () => load() },
    { tables: [...tables], throttleMs: CHANGE_THROTTLE_MS, signal: controller.signal },
  );
  return { stop: () => controller.abort(), reload: () => void load() };
}

/**
 * Runs `sql` now and after every change to `tables`, delivering each answer until stopped. Every
 * answer is delivered, equal to the last or not: callers also use it as a "these tables changed"
 * signal. Components read through `liveQuery` (the hooks in `live-rows.ts`) instead.
 */
export function watchQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[]) => void,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  return startWatch<Row>(db, sql, params, tables, onRows, onError).stop;
}

function sameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}

function idOf(row: unknown): unknown {
  return typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
}

/**
 * `next` with every row that equals a previous one replaced by that previous object, and `previous`
 * itself when nothing changed. Rows are matched by position first, then by `id`, so a row added at
 * the top of a list does not cost the rows under it their identity.
 */
export function reconcileRows<Row>(previous: readonly Row[], next: readonly Row[]): readonly Row[] {
  if (next.length === 0) return previous.length === 0 ? previous : NO_ROWS;
  let byId: Map<unknown, Row> | null = null;
  const previousWithId = (id: unknown): Row | undefined => {
    if (byId === null) {
      byId = new Map();
      for (const row of previous) {
        const key = idOf(row);
        if (key !== undefined && !byId.has(key)) byId.set(key, row);
      }
    }
    return byId.get(id);
  };
  let unchanged = previous.length === next.length;
  const rows = next.map((row, index) => {
    const inPlace = previous[index];
    if (inPlace !== undefined && sameRow(inPlace, row)) return inPlace;
    unchanged = false;
    const id = idOf(row);
    const moved = id === undefined ? undefined : previousWithId(id);
    return moved !== undefined && sameRow(moved, row) ? moved : row;
  });
  return unchanged ? previous : rows;
}

/** What a live query knows right now; a new object only when one of its fields changed. */
export interface LiveQueryState<Row> {
  /** The latest answer (`NO_ROWS` before the first); kept while a later read fails. */
  readonly rows: readonly Row[];
  /** Some read of this query has answered. */
  readonly answered: boolean;
  /** The latest read threw. */
  readonly failed: boolean;
  /** Why the latest read threw. */
  readonly error: unknown;
  /** Runs the query again; the same function for the life of the query. */
  readonly retry: () => void;
}

export interface LiveQuery<Row> {
  readonly getState: () => LiveQueryState<Row>;
  readonly subscribe: (listener: () => void) => () => void;
}

/** The state of a query that is not running (a value it depends on is not known yet). */
export const IDLE_QUERY: LiveQueryState<never> = {
  rows: NO_ROWS,
  answered: false,
  failed: false,
  error: undefined,
  retry: () => undefined,
};

const queries = new WeakMap<AbstractPowerSyncDatabase, Map<string, LiveQuery<unknown>>>();

export function liveQueryKey(
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
): string {
  return `${sql}\u0000${JSON.stringify(params)}\u0000${tables.join(',')}`;
}

function createLiveQuery<Row>(
  db: AbstractPowerSyncDatabase,
  key: string,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  shared: Map<string, LiveQuery<unknown>>,
): LiveQuery<Row> {
  const bound = [...params];
  const listeners = new Set<() => void>();
  let watch: Watch | null = null;
  let releasing: ReturnType<typeof setTimeout> | undefined;
  const retry = () => watch?.reload();
  let state: LiveQueryState<Row> = { ...IDLE_QUERY, retry };

  const set = (next: Omit<LiveQueryState<Row>, 'retry'>) => {
    state = { ...next, retry };
    listeners.forEach((listener) => listener());
  };
  const onRows = (rows: Row[]) => {
    const next = reconcileRows(state.rows, rows);
    if (state.answered && !state.failed && next === state.rows) return;
    set({ rows: next, answered: true, failed: false, error: undefined });
  };
  const onError = (error: unknown) => {
    // One failure is one change: the same read failing again on every table change is not news.
    if (!state.failed) set({ rows: state.rows, answered: state.answered, failed: true, error });
  };

  const getState = () => state;
  const releaseSoon = () => {
    clearTimeout(releasing);
    releasing = setTimeout(() => {
      if (listeners.size > 0) return;
      watch?.stop();
      watch = null;
      if (shared.get(key)?.getState === getState) shared.delete(key);
    }, RELEASE_AFTER_MS);
  };
  const query: LiveQuery<Row> = {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      clearTimeout(releasing);
      // Released between a render and its commit: this reader brings it back.
      if (!shared.has(key)) shared.set(key, query);
      watch ??= startWatch<Row>(db, sql, bound, tables, onRows, onError);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) releaseSoon();
      };
    },
  };
  // A query made for a render that never commits has no reader to release it.
  releaseSoon();
  return query;
}

/** The shared live query for `(db, sql, params, tables)`; it reads only while subscribed to. */
export function liveQuery<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  key: string = liveQueryKey(sql, params, tables),
): LiveQuery<Row> {
  let shared = queries.get(db);
  if (shared === undefined) {
    shared = new Map();
    queries.set(db, shared);
  }
  let query = shared.get(key);
  if (query === undefined) {
    query = createLiveQuery<unknown>(db, key, sql, params, tables, shared);
    shared.set(key, query);
  }
  return query as LiveQuery<Row>;
}
