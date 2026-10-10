/**
 * Which UI this phone shows: the native premium UI or the current one. The account's `ui.premium`
 * flag decides (per account through the api's bootstrap, so a rollout can target one person), a
 * Developer tools override on this phone beats the flag both ways, and a build without the premium
 * native modules (`@expo/ui`, the keyboard controller) always stays on the current UI: the premium
 * screens would call native code that build does not carry.
 *
 * The override lives in the default MMKV store, so it outlives a sign-out and "Start as a new
 * user" clears it with the rest of that store.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { useFlag } from '@/lib/analytics';

import { premiumNativeModulesReady } from './native-modules';

/** Where the UI in force comes from. */
export type PremiumUiSource = 'binary' | 'override' | 'flag';

export interface PremiumUiInputs {
  /** Developer tools' choice on this phone; null follows the flag. */
  readonly override: boolean | null;
  /** The account's `ui.premium` flag. */
  readonly flag: boolean;
  /** Whether this build carries the premium native modules. */
  readonly nativeReady: boolean;
}

export interface PremiumUiState {
  readonly premium: boolean;
  readonly source: PremiumUiSource;
}

/** The binary first (premium needs its native code), then the phone's override, then the flag. */
export function resolvePremiumUi({ override, flag, nativeReady }: PremiumUiInputs): PremiumUiState {
  if (!nativeReady) return { premium: false, source: 'binary' };
  if (override !== null) return { premium: override, source: 'override' };
  return { premium: flag, source: 'flag' };
}

const OVERRIDE_KEY = 'cp.ui.premium.override';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV());

let override: boolean | null | undefined;
let launch: PremiumUiState | undefined;
const listeners = new Set<() => void>();

/** Developer tools' choice on this phone as kept: true, false, or null (follow the flag). */
export function premiumUiOverride(): boolean | null {
  if (override === undefined) {
    const saved = store().getString(OVERRIDE_KEY);
    override = saved === 'on' ? true : saved === 'off' ? false : null;
  }
  return override;
}

/** Developer tools: premium on or off on this phone whatever the flag says; null follows it. */
export function setPremiumUiOverride(value: boolean | null): void {
  if (value === null) store().remove(OVERRIDE_KEY);
  else store().set(OVERRIDE_KEY, value ? 'on' : 'off');
  override = value;
  for (const listener of listeners) listener();
}

function subscribeOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook: read the store again, as a new launch would. */
export function reloadPremiumUiOverrideForTests(): void {
  override = undefined;
  launch = undefined;
}

export interface PremiumUiStatus extends PremiumUiInputs {
  /** The UI this run of the app shows: the first answer, so nothing swaps under the person. */
  readonly current: PremiumUiState;
  /** What the next launch will show (Developer tools restarts the app to apply it). */
  readonly next: PremiumUiState;
}

/** The UI in force, what the next launch shows and the raw inputs (Developer tools shows them). */
export function usePremiumUiStatus(): PremiumUiStatus {
  const flag = useFlag('ui.premium');
  const current = useSyncExternalStore(subscribeOverride, premiumUiOverride);
  const inputs = { override: current, flag, nativeReady: premiumNativeModulesReady() };
  const next = resolvePremiumUi(inputs);
  launch ??= next;
  return { ...inputs, current: launch, next };
}

/**
 * Whether this screen renders the premium UI. Fixed for the app's run: a flag that changes while
 * the app is open (a later bootstrap, a sign-out) applies at the next launch.
 */
export function usePremiumUi(): boolean {
  return usePremiumUiStatus().current.premium;
}
