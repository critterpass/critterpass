/**
 * What the trip's PLAN opens, read when the app navigates, so the founder flips it on the server
 * without a release: `plan.hub` (the trip map or the day plan), public config the phone syncs
 * (`client_config`); the planning register feeds every synced change in here. The last value is
 * kept on the phone, so an offline launch reads it before the database opens. Before the config
 * syncs, or when its value is missing or unreadable, PLAN opens the trip map.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

export type PlanHub = 'map' | 'day';

export const PLAN_HUB_KEY = 'plan.hub';
export const PLAN_HUB_DEFAULT: PlanHub = 'map';

const STORE_KEY = 'switch';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module. The store
// keeps its first id: phones hold the last hub there, and "Start as a new user" clears it.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-planning-switch' }));

/** A config value as synced: JSON text (`"day"`), or the bare word. */
function decode(value: string | null | undefined): unknown {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function hubOf(value: unknown): PlanHub {
  return value === 'day' ? 'day' : 'map';
}

/** The hub from `client_config` rows; anything missing or unreadable opens the trip map. */
export function readPlanHub(
  rows: readonly { readonly key: string; readonly value: string | null }[],
): PlanHub {
  return hubOf(decode(rows.find((row) => row.key === PLAN_HUB_KEY)?.value));
}

/** The kept value, `{hub}`; a phone that kept `{redesign, hub}` before reads its hub the same. */
function restore(): PlanHub | null {
  try {
    const saved = store().getString(STORE_KEY);
    if (saved === undefined) return null;
    return hubOf((JSON.parse(saved) as { hub?: unknown } | null)?.hub);
  } catch {
    return null;
  }
}

let current: PlanHub | null = null;
const listeners = new Set<() => void>();

function read(): PlanHub {
  current ??= restore() ?? PLAN_HUB_DEFAULT;
  return current;
}

function settle(next: PlanHub): void {
  if (read() === next) return;
  current = next;
  for (const listener of listeners) listener();
}

/** The synced config's value (the planning register feeds every change in here). */
export function applyPlanHub(next: PlanHub): void {
  store().set(STORE_KEY, JSON.stringify({ hub: next }));
  settle(next);
}

/** Signing out forgets the account's synced value. */
export function resetPlanHub(): void {
  store().remove(STORE_KEY);
  settle(PLAN_HUB_DEFAULT);
}

/** What the trip's PLAN tile opens, read now. */
export function planHub(): PlanHub {
  return read();
}

export function subscribePlanHub(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when the hub changes. */
export function usePlanHub(): PlanHub {
  return useSyncExternalStore(subscribePlanHub, read);
}

/** Test hook: read the store again, as a new launch would. */
export function reloadPlanHubForTests(): void {
  current = null;
}
