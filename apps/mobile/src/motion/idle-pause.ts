import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

/** How long an idle loop plays on a settled screen in the e2e build before it rests. */
export const E2E_IDLE_LOOP_MS = 1500;

/**
 * Idle loops never settle, and Maestro waits for a still screen before every command, so in the
 * e2e build (a release build of the `development` variant, see `app.config.ts`) each loop plays
 * briefly and then parks on its resting frame. Returns that play budget, or `null` (loop forever)
 * under a dev server and in every other variant.
 */
export function idleLoopBudgetMs(isDev: boolean, appVariant: unknown): number | null {
  return !isDev && appVariant === 'development' ? E2E_IDLE_LOOP_MS : null;
}

const buildBudgetMs = idleLoopBudgetMs(__DEV__, Constants.expoConfig?.extra?.appVariant);

/**
 * Whether an idle loop that wants to run (`active`) should still animate: always in shipped builds,
 * and only for the first `budgetMs` of each active stretch in the e2e build. The single switch every
 * perpetual loop (the loop presets, sheen, typing dots) goes through.
 */
export function useIdleLoopRunning(active: boolean, budgetMs = buildBudgetMs): boolean {
  const [spent, setSpent] = useState(false);

  useEffect(() => {
    if (!active || budgetMs === null) return;
    const timer = setTimeout(() => setSpent(true), budgetMs);
    return () => {
      clearTimeout(timer);
      setSpent(false);
    };
  }, [active, budgetMs]);

  return active && !spent;
}
