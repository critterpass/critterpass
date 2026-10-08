/**
 * The shared live-query hook over a real encrypted database: a table change that leaves a query's
 * answer alone re-renders nobody, a changed row costs only that row its identity, readers of one
 * query share one watcher, a read that lands late is dropped, and a failed read is an answer with
 * a retry.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { LocalFirstProvider } from '../local-first-context';
import { liveQuery, NO_ROWS, reconcileRows, RELEASE_AFTER_MS } from '../live-query-store';
import { useLiveRows, useQuietLiveRows } from '../live-rows';
import { openTestLocalFirst, type TestLocalFirst } from '../test-support/local-first-fixture';
import { removeDir } from '../test-support/open-node-database';
import { eventually } from '../test-support/queue-fixtures';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

interface NoteRow {
  id: string;
  value: string;
}

const NOTES_SQL = 'SELECT id, value FROM local_state WHERE id LIKE ? ORDER BY id';
const NOTES = ['note:%'];
const TABLES = ['local_state'];

const stacks: TestLocalFirst[] = [];
async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst();
  stacks.push(stack);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

function write(db: AbstractPowerSyncDatabase, id: string, value: string) {
  return db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [id, value]);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real database with its reads observed: every `getAll` runs against it straight away, is
 * counted, and (when `hold` is on) hands its answer over only when the test releases it.
 */
function observeReads(db: AbstractPowerSyncDatabase) {
  const releases: Array<() => void> = [];
  const seen = { reads: 0, watchers: 0, settled: 0, hold: false };
  const observed = {
    getAll: (sql: string, params?: unknown[]) => {
      seen.reads += 1;
      const answer = db.getAll(sql, params);
      const done = () => {
        seen.settled += 1;
      };
      if (!seen.hold) {
        void answer.then(done, done);
        return answer;
      }
      return new Promise((resolve, reject) => {
        releases.push(() => void answer.then(resolve, reject).then(done));
      });
    },
    onChange: (...args: Parameters<AbstractPowerSyncDatabase['onChange']>) => {
      seen.watchers += 1;
      return db.onChange(...args);
    },
  } as unknown as AbstractPowerSyncDatabase;
  return { db: observed, seen, releases };
}

function wrapperFor(stack: TestLocalFirst, db: AbstractPowerSyncDatabase) {
  const value = { ...stack.value, db };
  return ({ children }: { children: ReactNode }) =>
    createElement(LocalFirstProvider, { value }, children);
}

/** Every read started so far has answered and React has seen it. */
async function readsSettled(seen: { reads: number; settled: number }, atLeast: number) {
  await eventually(() => Promise.resolve(seen.reads >= atLeast && seen.settled === seen.reads));
  await act(() => pause(0));
}

describe('reconcileRows', () => {
  it('keeps the previous array for equal rows and the one empty array for no rows', () => {
    const previous = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ];
    expect(
      reconcileRows(previous, [
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
      ]),
    ).toBe(previous);
    expect(reconcileRows(previous, [])).toBe(NO_ROWS);
    expect(reconcileRows(NO_ROWS, [])).toBe(NO_ROWS);
  });

  it('keeps unchanged rows by id when a row is added above them or one goes', () => {
    const previous = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ];
    const added = reconcileRows(previous, [
      { id: 'new', n: 0 },
      { id: 'a', n: 1 },
      { id: 'b', n: 3 },
    ]);
    expect(added).not.toBe(previous);
    expect(added[1]).toBe(previous[0]);
    expect(added[2]).not.toBe(previous[1]);
    expect(added[2]).toEqual({ id: 'b', n: 3 });

    const removed = reconcileRows(previous, [{ id: 'b', n: 2 }]);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe(previous[1]);
  });

  it('tells apart rows that differ only in a null or in their columns', () => {
    const previous = [{ id: 'a', n: null as number | null }];
    expect(reconcileRows(previous, [{ id: 'a', n: 0 }])[0]).toEqual({ id: 'a', n: 0 });
    expect(reconcileRows(previous, [{ id: 'a', n: null, extra: 1 }])).not.toBe(previous);
  });
});

describe('useLiveRows', () => {
  it('returns the same result when a table change leaves the rows equal', async () => {
    const stack = await open();
    await write(stack.db, 'note:a', 'one');
    await write(stack.db, 'note:b', 'two');
    const { db, seen } = observeReads(stack.db);
    let renders = 0;
    const { result } = await renderHook(
      () => {
        renders += 1;
        return useLiveRows<NoteRow>(NOTES_SQL, NOTES, TABLES);
      },
      { wrapper: wrapperFor(stack, db) },
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const first = result.current;
    const rendersWhenLoaded = renders;
    expect(first.rows).toEqual([
      { id: 'note:a', value: 'one' },
      { id: 'note:b', value: 'two' },
    ]);

    // Another row of the same table, and a rewrite of a row with the value it already has.
    await write(stack.db, 'elsewhere', 'x');
    await readsSettled(seen, 2);
    await write(stack.db, 'note:a', 'one');
    await readsSettled(seen, 3);

    expect(result.current).toBe(first);
    expect(renders).toBe(rendersWhenLoaded);
  });

  it('gives a new array for one changed row and keeps the other rows as they were', async () => {
    const stack = await open();
    await write(stack.db, 'note:a', 'one');
    await write(stack.db, 'note:b', 'two');
    await write(stack.db, 'note:c', 'three');
    const { result } = await renderHook(() => useLiveRows<NoteRow>(NOTES_SQL, NOTES, TABLES), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    const before = result.current.rows;

    await act(() => write(stack.db, 'note:b', 'changed'));
    await waitFor(() => expect(result.current.rows[1]?.value).toBe('changed'));

    const after = result.current.rows;
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(before[1]).toEqual({ id: 'note:b', value: 'two' });
  });

  it('shares one watcher and one result between readers, and stops reading once they leave', async () => {
    const stack = await open();
    await write(stack.db, 'note:a', 'one');
    const { db, seen } = observeReads(stack.db);
    const wrapper = wrapperFor(stack, db);
    const read = () => useLiveRows<NoteRow>(NOTES_SQL, NOTES, TABLES);
    const one = await renderHook(read, { wrapper });
    const two = await renderHook(read, { wrapper });
    await waitFor(() => expect(two.result.current.loaded).toBe(true));
    await readsSettled(seen, 1);

    expect(seen).toMatchObject({ reads: 1, watchers: 1 });
    expect(two.result.current).toBe(one.result.current);

    await act(() => write(stack.db, 'note:a', 'again'));
    await waitFor(() => expect(one.result.current.rows[0]?.value).toBe('again'));
    await readsSettled(seen, 2);
    expect(seen).toMatchObject({ reads: 2, watchers: 1 });
    expect(two.result.current.rows).toBe(one.result.current.rows);

    // One reader leaving changes nothing for the other.
    await one.unmount();
    await act(() => write(stack.db, 'note:a', 'third'));
    await waitFor(() => expect(two.result.current.rows[0]?.value).toBe('third'));
    await readsSettled(seen, 3);

    await two.unmount();
    await pause(RELEASE_AFTER_MS + 100);
    await write(stack.db, 'note:a', 'unseen');
    await pause(200);
    expect(seen).toMatchObject({ reads: 3, watchers: 1 });

    // The next reader starts a watcher of its own and reads what is there now.
    const three = await renderHook(read, { wrapper });
    await waitFor(() => expect(three.result.current.rows[0]?.value).toBe('unseen'));
    expect(seen.watchers).toBe(2);
  });

  it('hands a reader that arrives a moment after the last one left the rows already read', async () => {
    const stack = await open();
    await write(stack.db, 'note:a', 'one');
    const { db, seen } = observeReads(stack.db);
    const wrapper = wrapperFor(stack, db);
    const read = () => useLiveRows<NoteRow>(NOTES_SQL, NOTES, TABLES);
    const one = await renderHook(read, { wrapper });
    await waitFor(() => expect(one.result.current.loaded).toBe(true));
    const rows = one.result.current.rows;
    await one.unmount();

    const two = await renderHook(read, { wrapper });
    expect(two.result.current.loaded).toBe(true);
    expect(two.result.current.rows).toBe(rows);
    expect(seen).toMatchObject({ reads: 1, watchers: 1 });
  });

  it('drops a read that answers after a newer one has', async () => {
    const stack = await open();
    await write(stack.db, 'note:a', 'old');
    const { db, seen, releases } = observeReads(stack.db);
    seen.hold = true;
    const query = liveQuery<NoteRow>(db, NOTES_SQL, NOTES, TABLES);
    const stop = query.subscribe(() => undefined);

    // The first read saw `old`; the second, started by the write, saw `new`.
    await eventually(() => Promise.resolve(releases.length === 1));
    await write(stack.db, 'note:a', 'new');
    await eventually(() => Promise.resolve(releases.length === 2));

    releases[1]!();
    await eventually(() => Promise.resolve(query.getState().answered));
    expect(query.getState().rows).toEqual([{ id: 'note:a', value: 'new' }]);

    releases[0]!();
    await eventually(() => Promise.resolve(seen.settled === 2));
    expect(query.getState().rows).toEqual([{ id: 'note:a', value: 'new' }]);
    stop();
  });

  it('reports a failed read as loaded with no rows, and retry runs it again', async () => {
    const stack = await open();
    const sql = 'SELECT id, value FROM late_notes ORDER BY id';
    const { result } = await renderHook(
      () => ({
        reporting: useLiveRows<NoteRow>(sql, [], ['late_notes']),
        quiet: useQuietLiveRows<NoteRow>(sql, [], ['late_notes']),
      }),
      { wrapper: stack.wrapper },
    );
    await waitFor(() => expect(result.current.reporting.loaded).toBe(true));
    const failed = result.current.reporting;
    expect(failed).toMatchObject({ rows: [], failed: true });
    expect(failed.error).toBeDefined();
    // The quiet form keeps waiting: a failed read is not an answer there.
    expect(result.current.quiet).toEqual({ rows: [], loaded: false });

    await stack.db.execute('CREATE TABLE late_notes (id TEXT PRIMARY KEY, value TEXT)');
    await stack.db.execute("INSERT INTO late_notes (id, value) VALUES ('a', 'here')");
    await act(async () => {
      failed.retry?.();
      await pause(0);
    });
    await waitFor(() => expect(result.current.reporting.failed).toBe(false));

    expect(result.current.reporting.rows).toEqual([{ id: 'a', value: 'here' }]);
    expect(result.current.reporting.retry).toBe(failed.retry);
    expect(result.current.quiet).toEqual({ rows: [{ id: 'a', value: 'here' }], loaded: true });
    expect(result.current.quiet.rows).toBe(result.current.reporting.rows);
  });

  it('skips the query for null params, with one not-loaded value for every reader', async () => {
    const stack = await open();
    const { db, seen } = observeReads(stack.db);
    const wrapper = wrapperFor(stack, db);
    const one = await renderHook(
      ({ params }: { params: readonly unknown[] | null }) =>
        useLiveRows<NoteRow>(NOTES_SQL, params, TABLES),
      { wrapper, initialProps: { params: null } },
    );
    const two = await renderHook(() => useLiveRows<NoteRow>(NOTES_SQL, null, TABLES), { wrapper });
    const waiting = one.result.current;
    expect(waiting).toEqual({ rows: [], loaded: false });
    expect(waiting.rows).toBe(NO_ROWS);
    expect(two.result.current).toBe(waiting);

    await one.rerender({ params: null });
    await pause(50);
    expect(one.result.current).toBe(waiting);
    expect(seen).toMatchObject({ reads: 0, watchers: 0 });

    // Once the params are known the query runs; an empty answer is the one empty array too.
    await one.rerender({ params: NOTES });
    await waitFor(() => expect(one.result.current.loaded).toBe(true));
    expect(one.result.current.rows).toBe(NO_ROWS);
  });
});
