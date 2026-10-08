/**
 * Live local queries: `watchQuery` runs a query now and again whenever one of its tables changes,
 * and `liveQuery` shares one such watcher and one result between everything reading the same
 * `(db, sql, params, tables)`. The shared result changes identity only when its content does: equal
 * rows keep the previous array, and unchanged rows keep their objects inside a changed one, so
 * memoised readers hold. A reader never gets rows read before it arrived: it waits for a read made
 * after it subscribed (one read for everyone arriving together), then shares the result. A query
 * nobody reads any more keeps its watcher a moment longer, for a screen that remounts.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

/** The one empty result: every query with no rows (or none yet) answers with this array. */
export const NO_ROWS: readonly never[] = [];

/** How long a query with no readers keeps its watcher and rows. */
export const RELEASE_AFTER_MS = 250;

const CHANGE_THROTTLE_MS = 30;

interface Watch {
  readonly stop: () => void;
  /** Starts a read and returns its number; reads are numbered in the order they start. */
  readonly read: () => number;
  /** The number of the newest read started. */
  readonly started: () => number;
}

/**
 * Follows `tables` and reads on every change (and whenever asked), numbering reads from `after`.
 * A read that finishes after a newer one has answered is dropped: with several read connections
 * they can land out of order, and the newer one already saw everything the older one did.
 */
function startWatch<Row>(
  db: AbstractPowerSyncDatabase,
  sql: string,
  params: readonly unknown[],
  tables: readonly string[],
  onRows: (rows: Row[], read: number) => void,
  onError: (error: unknown, read: number) => void,
  after = 0,
): Watch {
  const controller = new AbortController();
  let started = after;
  let answered = after;
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
        if (current(mine)) onRows(rows, mine);
      },
      (error: unknown) => {
        if (current(mine)) onError(error, mine);
      },
    );
  };
  db.onChange(
    { onChange: () => load() },
    { tables: [...tables], throttleMs: CHANGE_THROTTLE_MS, signal: controller.signal },
  );
  return {
    stop: () => controller.abort(),
    read: () => {
      void load();
      return started;
    },
    started: () => started,
  };
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
  const watch = startWatch<Row>(
    db,
    sql,
    params,
    tables,
    (rows) => onRows(rows),
    (error) => onError(error),
  );
  watch.read();
  return watch.stop;
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

/** One component's view of a shared query. */
export interface LiveQueryReader<Row> {
  /** The shared state, once a read made after this reader subscribed has answered. */
  readonly getState: () => LiveQueryState<Row>;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface LiveQuery<Row> {
  readonly reader: () => LiveQueryReader<Row>;
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
  /** Reads numbered so far (across watchers), the newest answered, and whether one is due. */
  let numbered = 0;
  let answered = 0;
  let readDue = false;
  const retry = () => void watch?.read();
  let state: LiveQueryState<Row> = { ...IDLE_QUERY, retry };

  // Every answer is announced, changed or not: a reader waiting for its first read hears it,
  // and one whose state object is the same as before does not re-render.
  const announce = (read: number) => {
    answered = read;
    listeners.forEach((listener) => listener());
  };
  const onRows = (rows: Row[], read: number) => {
    const next = reconcileRows(state.rows, rows);
    if (!state.answered || state.failed || next !== state.rows) {
      state = { rows: next, answered: true, failed: false, error: undefined, retry };
    }
    announce(read);
  };
  const onError = (error: unknown, read: number) => {
    // One failure is one change: the same read failing again on every table change is not news.
    if (!state.failed) state = { ...state, failed: true, error };
    announce(read);
  };

  /** Asks for a read made from now on, shared by everyone asking in the same tick; its number. */
  const readSoon = (following: Watch): number => {
    if (!readDue) {
      readDue = true;
      void Promise.resolve().then(() => {
        readDue = false;
        watch?.read();
      });
    }
    return following.started() + 1;
  };
  const releaseSoon = () => {
    clearTimeout(releasing);
    releasing = setTimeout(() => {
      if (listeners.size > 0) return;
      numbered = watch?.started() ?? numbered;
      watch?.stop();
      watch = null;
      if (shared.get(key) === query) shared.delete(key);
    }, RELEASE_AFTER_MS);
  };

  const query: LiveQuery<Row> = {
    reader: () => {
      let from: number | null = null;
      return {
        getState: () => (from !== null && answered >= from ? state : IDLE_QUERY),
        subscribe: (listener) => {
          clearTimeout(releasing);
          // Released between a render and its commit: this reader brings it back.
          if (!shared.has(key)) shared.set(key, query);
          const stopped = watch === null;
          watch ??= startWatch<Row>(db, sql, bound, tables, onRows, onError, numbered);
          // A reader that only re-subscribes (a remount in place) keeps what it was shown.
          if (from === null || stopped) from = readSoon(watch);
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
            if (listeners.size === 0) releaseSoon();
          };
        },
      };
    },
  };
  // A query made for a render that never commits has no reader to release it.
  releaseSoon();
  return query;
}

/** The shared live query for `(db, sql, params, tables)`; it reads only while it has readers. */
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
