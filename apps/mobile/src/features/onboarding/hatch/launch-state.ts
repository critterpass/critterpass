/**
 * Whether the native launch screen has gone this runtime: screens that open under it (a cold start
 * from a link mounts Home there) wait for it before they speak or move.
 */
import { useSyncExternalStore } from 'react';

interface LaunchState {
  revealed: boolean;
  listeners: Set<() => void>;
}

const state: LaunchState = { revealed: false, listeners: new Set() };

/** The root layout calls this as it hides the native launch screen. */
export function markSplashRevealed(): void {
  if (state.revealed) return;
  state.revealed = true;
  for (const listener of state.listeners) listener();
}

function subscribe(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Whether the native launch screen has gone. */
export function useSplashRevealed(): boolean {
  return useSyncExternalStore(subscribe, () => state.revealed);
}

/** Test seam: a fresh runtime. */
export function resetLaunchStateForTests(): void {
  state.revealed = false;
  state.listeners.clear();
}
