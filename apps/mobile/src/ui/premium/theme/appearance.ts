/**
 * The appearance setting (foundations-spec.md §2 "Dark": follows the phone, or set in Edit
 * profile): `system`, `light` or `dark`, kept on the phone so the first frame of the next launch
 * already has the right ground. The settings screen writes it through `setAppearance`; everything
 * else reads the resolved scheme from the premium theme.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import type { PremiumScheme } from '@cp/design-tokens';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

const STORE_KEY = 'appearance';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-appearance' }));

function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

let current: Appearance | null = null;
const listeners = new Set<() => void>();

/** The kept setting; anything missing or unreadable follows the phone. */
export function readAppearance(): Appearance {
  if (current === null) {
    const saved = store().getString(STORE_KEY);
    current = isAppearance(saved) ? saved : 'system';
  }
  return current;
}

export function setAppearance(next: Appearance): void {
  store().set(STORE_KEY, next);
  if (readAppearance() === next) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The setting and its setter, re-rendering when it changes anywhere. */
export function useAppearance(): readonly [Appearance, (next: Appearance) => void] {
  const appearance = useSyncExternalStore(subscribe, readAppearance, readAppearance);
  return [appearance, setAppearance] as const;
}

/**
 * The scheme to draw: the setting when it pins one, else the phone's. A phone that reports no
 * scheme (older Android, or before it answers) draws light, the design's default.
 */
export function resolveScheme(
  appearance: Appearance,
  system: PremiumScheme | null | undefined,
): PremiumScheme {
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

/** Forgets the in-memory copy so a test reads the store afresh. */
export function forgetAppearanceForTests(): void {
  current = null;
}
