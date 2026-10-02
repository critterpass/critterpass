/**
 * Set once a returning start finds no session while this phone still holds changes it never
 * sent (./returning-session-check.ts): the data is kept, and the app offers the sign-in that gets
 * this account back. Lives for the process; a restart starts clear and the check runs again.
 */
let lost = false;
let claimed = false;
const listeners = new Set<() => void>();

export const sessionLost = {
  get: (): boolean => lost,
  set: (): void => {
    if (lost) return;
    lost = true;
    for (const listener of listeners) listener();
  },
  /** True for the one caller that acts on it (the sign-in opens once per process). */
  claim: (): boolean => {
    if (!lost || claimed) return false;
    claimed = true;
    return true;
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Tests only: back to a fresh process. */
  resetForTests: (): void => {
    lost = false;
    claimed = false;
  },
};
