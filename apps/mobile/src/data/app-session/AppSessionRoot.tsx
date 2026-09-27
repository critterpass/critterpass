/**
 * Starts the app's session from the root layout and provides what it opened: the local-first
 * database (`useLocalFirst`) and the realtime client (`useRealtimeClient`). Screens render
 * straight away; both contexts stay null until the session is up. A failed start (a first launch
 * with no network) retries with backoff and on every return to the foreground. It also keeps
 * this install's push registration fresh (data/push/use-push-lifecycle.ts) for the signed-in uid.
 *
 * The session lives for the process: the root starts it once on mount, whatever props it
 * re-renders with, and unmounting (fast refresh, StrictMode's double effect) stops listening,
 * never the session itself.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LocalFirstContext } from '../powersync/local-first-context';
import type { ForegroundSource } from '../commands/drain-extension-outbox';
import { usePushLifecycle, type PushLifecycleDeps } from '../push/use-push-lifecycle';
import { RealtimeClientContext } from '../realtime/use-channel';
import type { AppSession } from './start-app-session';

export const START_RETRY_MS = [2_000, 5_000, 15_000, 60_000] as const;

export interface AppSessionRootProps {
  readonly start: () => Promise<AppSession>;
  readonly appState: ForegroundSource;
  readonly onError: (error: unknown) => void;
  /** Push registration; absent where the platform has no push (web). A module constant. */
  readonly push?: PushLifecycleDeps | undefined;
  readonly children: ReactNode;
}

export function AppSessionRoot({ start, appState, onError, push, children }: AppSessionRootProps) {
  const [session, setSession] = useState<AppSession | null>(null);
  usePushLifecycle(push);
  const mounted = useRef({ start, appState, onError });

  useEffect(() => {
    const { start, appState, onError } = mounted.current;
    let active = true;
    let attempt = 0;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (!active || running) return;
      running = true;
      clearTimeout(timer);
      start().then(
        (started) => {
          running = false;
          subscription.remove();
          if (active) setSession(started);
        },
        (error: unknown) => {
          running = false;
          if (!active) return;
          onError(error);
          const delay = START_RETRY_MS[Math.min(attempt, START_RETRY_MS.length - 1)];
          attempt += 1;
          timer = setTimeout(run, delay);
        },
      );
    };

    const subscription = appState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    run();
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return (
    <LocalFirstContext.Provider value={session?.localFirst ?? null}>
      <RealtimeClientContext.Provider value={session?.realtime ?? null}>
        {children}
      </RealtimeClientContext.Provider>
    </LocalFirstContext.Provider>
  );
}
