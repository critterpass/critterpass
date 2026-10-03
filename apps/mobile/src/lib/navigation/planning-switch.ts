/**
 * The planning rollout switch and the plan hub choice, read when the app navigates (a route
 * builder, a hub tile, a deep link), so the founder flips them on the server without a release:
 * `planning.redesign` (the section 7 screens instead of the earlier plan and places screens, off
 * until switched on) and `plan.hub` (what PLAN opens: the trip map or the day plan). Both are
 * public config the phone syncs (`client_config`); the planning register feeds every synced change
 * in here. The last values are kept on the phone, so an offline launch reads them before the
 * database opens; missing or unreadable values read as off and the trip map.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

export type PlanHub = 'map' | 'day';

export interface PlanningSwitch {
  readonly redesign: boolean;
  readonly hub: PlanHub;
}

export const PLANNING_SWITCH_KEYS = ['planning.redesign', 'plan.hub'] as const;
export const PLANNING_SWITCH_DEFAULT: PlanningSwitch = { redesign: false, hub: 'map' };

const STORE_KEY = 'switch';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-planning-switch' }));

/** A config value as synced: JSON text (`true`, `"day"`), or the bare word. */
function decode(value: string | null | undefined): unknown {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** The switch from `client_config` rows; anything missing or unreadable keeps the default. */
export function readPlanningSwitch(
  rows: readonly { readonly key: string; readonly value: string | null }[],
): PlanningSwitch {
  const byKey = new Map(rows.map((row) => [row.key, decode(row.value)]));
  const redesign = byKey.get('planning.redesign');
  const hub = byKey.get('plan.hub');
  return {
    redesign: redesign === true || redesign === 'true' || redesign === 1,
    hub: hub === 'day' ? 'day' : 'map',
  };
}

function restore(): PlanningSwitch {
  try {
    const saved = store().getString(STORE_KEY);
    if (saved === undefined) return PLANNING_SWITCH_DEFAULT;
    const parsed = JSON.parse(saved) as Partial<PlanningSwitch>;
    return {
      redesign: parsed.redesign === true,
      hub: parsed.hub === 'day' ? 'day' : 'map',
    };
  } catch {
    return PLANNING_SWITCH_DEFAULT;
  }
}

let current: PlanningSwitch | null = null;
const listeners = new Set<() => void>();

function read(): PlanningSwitch {
  current ??= restore();
  return current;
}

export function applyPlanningSwitch(next: PlanningSwitch): void {
  const now = read();
  if (now.redesign === next.redesign && now.hub === next.hub) return;
  current = next;
  store().set(STORE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

/** Signing out forgets the account's values. */
export function resetPlanningSwitch(): void {
  store().remove(STORE_KEY);
  current = PLANNING_SWITCH_DEFAULT;
  for (const listener of listeners) listener();
}

/** Whether the section 7 planning screens are on, read now. */
export function planningRedesign(): boolean {
  return read().redesign;
}

/** What the trip's PLAN tile opens, read now. */
export function planHub(): PlanHub {
  return read().hub;
}

export function subscribePlanningSwitch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when the switch changes (a screen that shows one entry or the other). */
export function usePlanningSwitch(): PlanningSwitch {
  return useSyncExternalStore(subscribePlanningSwitch, read);
}
