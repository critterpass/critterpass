import type { Href } from 'expo-router';

import type { ScreenId } from './screen-registry';
import { useScreenHref } from './screen-registry';

export type SessionGateState =
  | { readonly status: 'loading' }
  | { readonly status: 'signedOut' }
  | { readonly status: 'onboarding' }
  | { readonly status: 'ready' };

type SessionGateHook = () => SessionGateState;

const SIGNED_OUT: SessionGateState = { status: 'signedOut' };

let sessionGateHook: SessionGateHook = () => SIGNED_OUT;

/**
 * The auth phase supplies the real session hook once at startup, before the shell renders; it must
 * stay the same hook for the app's lifetime (rules of hooks). Until then every launch is signed out.
 */
export function provideSessionGate(hook: SessionGateHook): void {
  sessionGateHook = hook;
}

export function useSessionGate(): SessionGateState {
  return sessionGateHook();
}

/** Onboarding starts at the splash (3a-1); signed-out and mid-onboarding sessions resume there. */
export const ONBOARDING_ENTRY_SCREEN: ScreenId = '3a-1';

export type GateDecision =
  | { readonly kind: 'wait' }
  | { readonly kind: 'redirect'; readonly href: Href }
  | { readonly kind: 'allow' };

/** Pure gate rule: signed-out/onboarding sessions go to onboarding once that route is registered. */
export function decideGate(
  state: SessionGateState,
  onboardingHref: Href | undefined,
): GateDecision {
  if (state.status === 'loading') return { kind: 'wait' };
  if (state.status === 'ready' || onboardingHref === undefined) return { kind: 'allow' };
  return { kind: 'redirect', href: onboardingHref };
}

/** The onboarding half of the gate (the tabs use it alone): where the current session may go. */
export function useGateDecision(): GateDecision {
  const state = useSessionGate();
  const onboardingHref = useScreenHref(ONBOARDING_ENTRY_SCREEN);
  return decideGate(state, onboardingHref);
}

export type SessionGateStep =
  | { readonly kind: 'wait' }
  | { readonly kind: 'redirect'; readonly href: Href }
  | { readonly kind: 'show' };

/**
 * What a session-only group shows right now: a signed-out or mid-onboarding session leaves (for
 * onboarding, or for `signedOutTo` when the group names somewhere else), a session still starting
 * waits, and only a ready session with its local database open gets the screens.
 */
export function sessionGateStep(
  decision: GateDecision,
  databaseOpen: boolean,
  signedOutTo?: Href,
): SessionGateStep {
  if (decision.kind === 'redirect') return { kind: 'redirect', href: signedOutTo ?? decision.href };
  if (decision.kind === 'wait' || !databaseOpen) return { kind: 'wait' };
  return { kind: 'show' };
}
