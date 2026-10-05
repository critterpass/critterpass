/**
 * The planning rollout switch and the plan hub choice, read when the app navigates (a route
 * builder, a hub tile, a deep link), so the founder flips them on the server without a release:
 * `planning.redesign` (the section 7 screens instead of the earlier plan and places screens) and
 * `plan.hub` (what PLAN opens: the trip map or the day plan). Both are public config the phone
 * syncs (`client_config`); the planning register feeds every synced change in here. The last values
 * are kept on the phone, so an offline launch reads them before the database opens. The section 7
 * screens are the default: before the config syncs, or when its value is missing or unreadable,
 * the redesign reads as on and PLAN opens the trip map; only an explicit `false` from the server
 * turns it off, and Developer tools' override on this phone wins over both.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

export type PlanHub = 'map' | 'day';

export interface PlanningSwitch {
  readonly redesign: boolean;
  readonly hub: PlanHub;
}

export const PLANNING_SWITCH_KEYS = ['planning.redesign', 'plan.hub'] as const;
export const PLANNING_SWITCH_DEFAULT: PlanningSwitch = { redesign: true, hub: 'map' };

const STORE_KEY = 'switch';
const OVERRIDE_KEY = 'override';
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

/** An explicit off from the server: `false` as JSON or a bare word, or `0`. */
function isOff(value: unknown): boolean {
  return value === false || value === 'false' || value === 0;
}

/** The switch from `client_config` rows; anything missing or unreadable keeps the default. */
export function readPlanningSwitch(
  rows: readonly { readonly key: string; readonly value: string | null }[],
): PlanningSwitch {
  const byKey = new Map(rows.map((row) => [row.key, decode(row.value)]));
  const redesign = byKey.get('planning.redesign');
  const hub = byKey.get('plan.hub');
  return {
    redesign: !isOff(redesign),
    hub: hub === 'day' ? 'day' : 'map',
  };
}

function restoreSynced(): PlanningSwitch | null {
  try {
    const saved = store().getString(STORE_KEY);
    if (saved === undefined) return null;
    const parsed = JSON.parse(saved) as Partial<PlanningSwitch>;
    return {
      redesign: parsed.redesign !== false,
      hub: parsed.hub === 'day' ? 'day' : 'map',
    };
  } catch {
    return null;
  }
}

function restoreOverride(): boolean | null {
  const saved = store().getString(OVERRIDE_KEY);
  return saved === 'on' ? true : saved === 'off' ? false : null;
}

/** Where the redesign value in force comes from. */
export type PlanningSwitchSource = 'override' | 'config' | 'default';

interface SwitchState {
  /** The synced config's values; null until any arrive (on this phone, ever). */
  readonly synced: PlanningSwitch | null;
  /** Developer tools' local override of `planning.redesign`; null follows the config. */
  readonly override: boolean | null;
  /** What the app reads: the override over the config over the defaults. */
  readonly effective: PlanningSwitch;
}

function compose(synced: PlanningSwitch | null, override: boolean | null): SwitchState {
  const base = synced ?? PLANNING_SWITCH_DEFAULT;
  return { synced, override, effective: { ...base, redesign: override ?? base.redesign } };
}

let current: SwitchState | null = null;
const listeners = new Set<() => void>();

function state(): SwitchState {
  current ??= compose(restoreSynced(), restoreOverride());
  return current;
}

function read(): PlanningSwitch {
  return state().effective;
}

function settle(next: SwitchState): void {
  const before = state();
  const same =
    before.effective.redesign === next.effective.redesign &&
    before.effective.hub === next.effective.hub;
  // An unchanged value keeps its object, so readers don't re-render; its source may still change.
  current = same ? { ...next, effective: before.effective } : next;
  for (const listener of listeners) listener();
}

/** The synced config's values (the planning register feeds every change in here). */
export function applyPlanningSwitch(next: PlanningSwitch): void {
  const now = state();
  if (now.synced?.redesign === next.redesign && now.synced.hub === next.hub) return;
  store().set(STORE_KEY, JSON.stringify(next));
  settle(compose(next, now.override));
}

/**
 * Developer tools' local override of `planning.redesign` for this phone (device runs turn the
 * section 7 screens on without touching the shared config); null goes back to the config. Kept
 * across launches; "Start as a new user" clears it with the rest of this store.
 */
export function setPlanningRedesignOverride(value: boolean | null): void {
  if (value === null) store().remove(OVERRIDE_KEY);
  else store().set(OVERRIDE_KEY, value ? 'on' : 'off');
  settle(compose(state().synced, value));
}

/** Signing out forgets the account's synced values; a developer override stays with the phone. */
export function resetPlanningSwitch(): void {
  store().remove(STORE_KEY);
  settle(compose(null, state().override));
}

/** Whether the section 7 planning screens are on, read now. */
export function planningRedesign(): boolean {
  return read().redesign;
}

/** What the trip's PLAN tile opens, read now. */
export function planHub(): PlanHub {
  return read().hub;
}

function sourceOf(now: SwitchState): PlanningSwitchSource {
  if (now.override !== null) return 'override';
  return now.synced === null ? 'default' : 'config';
}

/** Where `planningRedesign()` comes from right now. */
export function planningRedesignSource(): PlanningSwitchSource {
  return sourceOf(state());
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

/** The redesign value in force and where it comes from (Developer tools). */
export function usePlanningRedesignSource(): {
  readonly redesign: boolean;
  readonly source: PlanningSwitchSource;
} {
  const now = useSyncExternalStore(subscribePlanningSwitch, state);
  return { redesign: now.effective.redesign, source: sourceOf(now) };
}

/** Test hook: read the store again, as a new launch would. */
export function reloadPlanningSwitchForTests(): void {
  current = null;
}
