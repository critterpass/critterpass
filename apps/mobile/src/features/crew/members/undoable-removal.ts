/**
 * Removing someone from a crew with a way back: the member leaves the list at once, and the
 * removal is only sent once the Undo window has passed. Undo inside the window sends nothing;
 * leaving the screen sends whatever is still waiting, so a removal is never lost.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

/** How long the Undo stays offered. */
export const REMOVE_UNDO_MS = 10_000;

export interface Timers {
  readonly set: (run: () => void, ms: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

const SYSTEM_TIMERS: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface UndoableRemoval {
  /** Hides the member now; sends the removal after the window. */
  readonly remove: (uid: string) => void;
  /** Takes a waiting removal back; false when it already went. */
  readonly undo: (uid: string) => boolean;
  /** Sends every waiting removal now (the screen is going away). */
  readonly flush: () => void;
  readonly waiting: () => readonly string[];
  /** Points later sends at a newer commit (the screen re-rendered with a fresh callback). */
  readonly rebind: (commit: (uid: string) => void) => void;
}

export function createUndoableRemoval(
  commit: (uid: string) => void,
  onChange: (waiting: readonly string[]) => void,
  ms: number = REMOVE_UNDO_MS,
  timers: Timers = SYSTEM_TIMERS,
): UndoableRemoval {
  let deliver = commit;
  const pending = new Map<string, unknown>();
  const changed = () => onChange([...pending.keys()]);
  const send = (uid: string) => {
    if (!pending.has(uid)) return;
    pending.delete(uid);
    changed();
    deliver(uid);
  };
  return {
    remove: (uid) => {
      if (pending.has(uid)) return;
      pending.set(
        uid,
        timers.set(() => send(uid), ms),
      );
      changed();
    },
    undo: (uid) => {
      const handle = pending.get(uid);
      if (handle === undefined) return false;
      timers.clear(handle);
      pending.delete(uid);
      changed();
      return true;
    },
    flush: () => {
      for (const [uid, handle] of [...pending]) {
        timers.clear(handle);
        send(uid);
      }
    },
    waiting: () => [...pending.keys()],
    rebind: (next) => {
      deliver = next;
    },
  };
}

/** The removal as a screen uses it: who is waiting to go, kept in state; flushed on unmount. */
export function useUndoableRemoval(commit: (uid: string) => void) {
  const [waiting, setWaiting] = useState<readonly string[]>([]);
  const [removal] = useState(() => createUndoableRemoval(commit, setWaiting));
  useEffect(() => removal.rebind(commit), [removal, commit]);
  useEffect(() => () => removal.flush(), [removal]);
  const remove = useCallback((uid: string) => removal.remove(uid), [removal]);
  const undo = useCallback((uid: string) => removal.undo(uid), [removal]);
  return useMemo(() => ({ waiting, remove, undo }), [waiting, remove, undo]);
}

type RemovalListener = (crewId: string, uid: string) => void;
const listeners = new Set<RemovalListener>();

/**
 * Asks the crew page underneath to remove someone (the member sheet closes first, so the Undo
 * lives on the page that stays). Nobody listening: nothing happens.
 */
export function requestRemoval(crewId: string, uid: string): void {
  for (const listener of listeners) listener(crewId, uid);
}

export function onRemovalRequest(listener: RemovalListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
