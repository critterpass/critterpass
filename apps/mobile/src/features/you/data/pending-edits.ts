/**
 * Changes this phone has made that its synced rows do not show yet. A setting, a name or an avatar
 * changed here is kept on the phone and sent when there is signal, and the local row only changes
 * once the server's copy syncs back. Until then every screen that draws the value reads it from
 * here over the row, so a change survives leaving the screen and shows the same in Settings, Pings
 * and the profile. An edit is dropped as soon as the row agrees with it (or the send failed).
 */
import { useEffect, useSyncExternalStore } from 'react';

type Edits = Readonly<Record<string, unknown>>;

const NONE: Edits = Object.freeze({});
const scopes = new Map<string, Edits>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pendingEdits<T extends object>(scope: string): Partial<T> {
  return (scopes.get(scope) ?? NONE) as Partial<T>;
}

export function putPendingEdits<T extends object>(scope: string, patch: Partial<T>): void {
  scopes.set(scope, { ...scopes.get(scope), ...patch });
  emit();
}

export function dropPendingEdits<T extends object>(
  scope: string,
  keys: readonly (keyof T)[],
): void {
  const held = scopes.get(scope);
  if (held === undefined || !keys.some((key) => (key as string) in held)) return;
  const rest: Record<string, unknown> = { ...held };
  for (const key of keys) delete rest[key as string];
  if (Object.keys(rest).length === 0) scopes.delete(scope);
  else scopes.set(scope, rest);
  emit();
}

/** Every pending edit, forgotten (tests; the app restarts when the phone is cleared). */
export function resetPendingEdits(): void {
  scopes.clear();
  emit();
}

function same(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/** The edits of `scope` the stored value does not show yet; the ones it does are dropped. */
export function settledKeys<T extends object>(edits: Partial<T>, stored: Partial<T>): (keyof T)[] {
  return (Object.keys(edits) as (keyof T)[]).filter(
    (key) => key in stored && same(edits[key], stored[key]),
  );
}

/**
 * This phone's unsynced edits of `scope`, to draw over `stored`. Edits `stored` already shows are
 * dropped (fields it leaves out are kept). Pass `stored` as null while the row has not been read:
 * edits still show, and nothing is dropped against a row that is not there yet.
 */
export function usePendingEdits<T extends object>(
  scope: string,
  stored: Partial<T> | null,
): Partial<T> {
  const edits = useSyncExternalStore(subscribe, () => pendingEdits<T>(scope));
  useEffect(() => {
    if (stored === null) return;
    const settled = settledKeys(edits, stored);
    if (settled.length > 0) dropPendingEdits<T>(scope, settled);
  }, [scope, edits, stored]);
  return edits;
}
