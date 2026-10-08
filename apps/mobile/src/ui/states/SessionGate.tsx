import type { Href } from 'expo-router';
import { Redirect } from 'expo-router';
import { createContext, useContext, type ReactNode } from 'react';

import { sessionGateStep, useGateDecision } from '@/lib/navigation/gates';

import { SessionWaiting } from './SessionWaiting';

/**
 * Whether the session's local database is open. The root layout sets it from the app session; this
 * layer cannot read the data layer itself.
 */
const SessionDatabaseContext = createContext(false);

export const SessionDatabaseProvider = SessionDatabaseContext.Provider;

export interface SessionGateProps {
  /** Where a signed-out or mid-onboarding session goes instead of onboarding's first screen. */
  readonly signedOutTo?: Href;
  readonly testID?: string;
  readonly children: ReactNode;
}

/**
 * The one gate for every session-only route group, used by the group's layout: nothing under it
 * mounts before the session is signed in, onboarded and has its local database open. A link, a
 * notification or a restored launch can open any of these groups cold, before the session is up;
 * the group then shows the loading state for that moment instead of a screen that cannot read.
 */
export function SessionGate({
  signedOutTo,
  testID = 'session-waiting',
  children,
}: SessionGateProps) {
  const decision = useGateDecision();
  const databaseOpen = useContext(SessionDatabaseContext);
  const step = sessionGateStep(decision, databaseOpen, signedOutTo);
  if (step.kind === 'redirect') return <Redirect href={step.href} />;
  if (step.kind === 'wait') return <SessionWaiting testID={testID} />;
  return children;
}

export interface DatabaseWaitProps {
  /** The session's local database is open. */
  readonly open: boolean;
  readonly testID?: string;
  readonly children: ReactNode;
}

/**
 * The database half of the gate on its own, for a screen that reads the local database and may be
 * rendered outside a gated layout (a tab screen, a test): the loading state until it is open.
 */
export function DatabaseWait({ open, testID = 'session-waiting', children }: DatabaseWaitProps) {
  return open ? children : <SessionWaiting testID={testID} />;
}
