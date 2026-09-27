import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

/** docs/design-system.md §4.4 IslandToast: "2.8 s (6 s with action)". */
const DEFAULT_DURATION_MS = 2800;
const WITH_ACTION_DURATION_MS = 6000;

export interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface ToastRequest {
  /** De-dupe key: a second `show()` with the same id while it's current or queued is dropped. */
  readonly id: string;
  /** A caller-rendered sticker/icon node — `src/motion` may not import `@cp/critter-art` directly. */
  readonly sticker?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ToastAction;
}

export interface QueuedToast extends ToastRequest {
  readonly durationMs: number;
}

let queue: QueuedToast[] = [];
let current: QueuedToast | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function clearDismissTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function scheduleNext(): void {
  if (current || queue.length === 0) return;
  const next = queue.shift();
  if (!next) return;
  current = next;
  notify();
  dismissTimer = setTimeout(() => dismissCurrent(), current.durationMs);
}

function dismissCurrent(): void {
  clearDismissTimer();
  if (!current) return;
  current = null;
  notify();
  scheduleNext();
}

function isQueuedOrCurrent(id: string): boolean {
  return current?.id === id || queue.some((toast) => toast.id === id);
}

/**
 * The island toast's module-level queue (docs/design-system.md §4.4: "max 1 visible, queue drains" —
 * this phase's own undesigned-state fallback for overflow). A singleton, like `patterns/draw.tsx`'s
 * `drawGate`, so `toast.show()` is callable from anywhere, not just inside a component.
 */
export const toastQueue = {
  subscribe(this: void, listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getCurrent(this: void): QueuedToast | null {
    return current;
  },
  show(request: ToastRequest): void {
    if (isQueuedOrCurrent(request.id)) return;
    const durationMs = request.action ? WITH_ACTION_DURATION_MS : DEFAULT_DURATION_MS;
    queue.push({ ...request, durationMs });
    scheduleNext();
  },
  /** Swipe-up (or programmatic) dismissal of the current toast; the next queued one takes its place. */
  dismiss(): void {
    dismissCurrent();
  },
  /** Test-only: this singleton's queue and timer otherwise leak across test files. */
  resetForTests(): void {
    clearDismissTimer();
    queue = [];
    current = null;
    notify();
  },
};

export function useToastQueue(): QueuedToast | null {
  return useSyncExternalStore(toastQueue.subscribe, toastQueue.getCurrent);
}
