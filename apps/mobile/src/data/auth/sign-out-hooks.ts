/**
 * Registry of local-state cleanup hooks that must run whenever the client stops being the current
 * uid — a real sign-out, or a successful merge switching to `existing_uid` (docs/data-model.md §3.1;
 * docs/data-model-sync-and-privacy.md §4 "account switch → `disconnectAndClear()`"). This module owns
 * only the registry; phase 10 T4 registers PowerSync's `disconnectAndClear()` here, and a later phase
 * registers `local_private` wipe — neither dependency exists yet in this phase, so nothing is
 * pre-registered.
 */

export type OnSignOutHook = () => Promise<void> | void;

const hooks: OnSignOutHook[] = [];

/** Registers a hook to run, in registration order, every time `runOnSignOutHooks` fires. */
export function registerOnSignOut(hook: OnSignOutHook): void {
  hooks.push(hook);
}

/** Runs every registered hook in order, awaiting each before starting the next — order matters (e.g. PowerSync must disconnect before local storage it depends on is wiped). */
export async function runOnSignOutHooks(): Promise<void> {
  for (const hook of hooks) {
    await hook();
  }
}

/** Test-only: clears every registration so one test file's spies cannot leak into another. */
export function resetOnSignOutHooksForTests(): void {
  hooks.length = 0;
}
