/**
 * The end of onboarding: the session gate opens, and a link that arrived before the pass existed
 * (an invite, a place) is opened now instead of Home.
 */
import { useSyncExternalStore } from 'react';

import type { SessionGateState } from '@/lib/navigation/gates';
import { resumePendingLink } from '@/lib/links/router';
import { isOnboardingComplete, setOnboardingComplete } from '@/lib/links/pending';
import { useSessionLostSignIn } from '../phone/session-lost-sign-in';

const HOME = '/';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the gate and returns where to go next: the waiting link's screen, or Home. */
export async function completeOnboarding(): Promise<string> {
  setOnboardingComplete(true);
  listeners.forEach((listener) => listener());
  return (await resumePendingLink()) ?? HOME;
}

/** Marks onboarding done without routing (a returning user who signed in to their own pass). */
export function markOnboardingComplete(): void {
  setOnboardingComplete(true);
  listeners.forEach((listener) => listener());
}

const READY: SessionGateState = { status: 'ready' };
const ONBOARDING: SessionGateState = { status: 'onboarding' };

/** The session gate: tabs and trip screens wait behind onboarding until it completes. */
export function useOnboardingGate(): SessionGateState {
  useSessionLostSignIn();
  const done = useSyncExternalStore(subscribe, isOnboardingComplete);
  return done ? READY : ONBOARDING;
}
