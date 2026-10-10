/** The toast stack's rules, kept apart from the host so they can be checked without a screen. */
import type { ToastSpec } from './Toast';

export interface QueuedToast {
  readonly id: number;
  readonly spec: ToastSpec;
}

/** At most this many toasts stack at once; the oldest leaves when another arrives. */
export const MAX_STACKED_TOASTS = 3;

/** Adds a toast on top. A toast saying the same thing as one already up replaces it. */
export function pushToast(
  queue: readonly QueuedToast[],
  next: QueuedToast,
  max = MAX_STACKED_TOASTS,
): readonly QueuedToast[] {
  const key = JSON.stringify(next.spec);
  const rest = queue.filter((q) => JSON.stringify(q.spec) !== key);
  return [...rest, next].slice(-max);
}

export function dropToast(queue: readonly QueuedToast[], id: number): readonly QueuedToast[] {
  return queue.filter((q) => q.id !== id);
}

/** How long a toast stays: errors twice as long, so the retry line can be read; a tap dismisses any. */
export function toastHold(spec: ToastSpec, holdMs: number): number {
  return spec.kind === 'error' ? holdMs * 2 : holdMs;
}
