/**
 * The saved toast: one line after a command lands (label, version when the aggregate has one, and
 * the command's op_id for the audit log), gone after 2.8 s. A module calls `showSavedToast`; the
 * shell renders `<Toaster />` once.
 */
import { useEffect, useSyncExternalStore } from 'react';

export const TOAST_MS = 2800;

export interface SavedToast {
  readonly id: number;
  readonly label: string;
  readonly version?: string | number | undefined;
  readonly opId?: string | undefined;
}

let current: SavedToast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showSavedToast(toast: Omit<SavedToast, 'id'>): void {
  current = { ...toast, id: nextId };
  nextId += 1;
  emit();
}

export function dismissToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  useEffect(() => {
    if (toast === null) return undefined;
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  if (toast === null) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-check" aria-hidden="true">
        ✓
      </span>
      <span>
        <strong>{toast.label}</strong>
        {toast.version !== undefined && <span className="mono"> · v{toast.version}</span>}
      </span>
      {toast.opId !== undefined && (
        <span className="mono toast-op">op {toast.opId.slice(0, 13)}…</span>
      )}
    </div>
  );
}
