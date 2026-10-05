/**
 * Guides as the app knows them without a screen: the id type, the guide the shell shows, the
 * synced guide rows (every critter is the guide of its own city, and its row carries its name, its
 * critter and its accent), and whether guides go by city (`guides.per_city`, public config the
 * phone syncs). `data/guides` feeds the rows and the switch in; `ui/avatar/guides` turns a row
 * into what screens draw.
 */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

/** A guide's slug: its critter's name in plain lowercase letters (`tokek`, `ngua`). */
export type GuideId = string;

export interface ActiveGuide {
  readonly guideId: GuideId;
}

/** Brand default guide when no trip or destination gives context. */
export const DEFAULT_GUIDE: ActiveGuide = { guideId: 'tokek' };

type ActiveGuideHook = () => ActiveGuide | null;

let activeGuideHook: ActiveGuideHook = () => null;

/**
 * The trip phase supplies the real hook (guide of the current trip or destination) once at startup,
 * before the shell renders; it must be a stable hook for the app's lifetime (rules of hooks).
 */
export function provideActiveGuide(hook: ActiveGuideHook): void {
  activeGuideHook = hook;
}

/** Guide the FAB and empty states show: the context guide, else Tokek. */
export function useActiveGuide(): ActiveGuide {
  return activeGuideHook() ?? DEFAULT_GUIDE;
}

// ---------------------------------------------------------------------------------------------
// The synced guide rows.

export interface GuideRow {
  readonly slug: string;
  readonly name: string;
  /** The guide's dex critter (`cp-###`); null on a row older than the link. */
  readonly critterKey: string | null;
  /** `#rrggbb`; null until the server has computed it. */
  readonly accent: string | null;
}

let guideRows: ReadonlyMap<string, GuideRow> = new Map();
let guideRowsVersion = 0;
const rowListeners = new Set<() => void>();

/** The guide rows as last read from the local database (`data/guides` feeds every change). */
export function applyGuideRows(rows: readonly GuideRow[]): void {
  const next = new Map(rows.map((row) => [row.slug, row]));
  const same =
    next.size === guideRows.size &&
    rows.every((row) => {
      const before = guideRows.get(row.slug);
      return (
        before !== undefined &&
        before.name === row.name &&
        before.critterKey === row.critterKey &&
        before.accent === row.accent
      );
    });
  if (same) return;
  guideRows = next;
  guideRowsVersion += 1;
  for (const listener of rowListeners) listener();
}

export function guideRow(slug: string): GuideRow | undefined {
  return guideRows.get(slug);
}

/** Changes whenever the rows do; a cache keyed on it is never stale. */
export function guideRowsRevision(): number {
  return guideRowsVersion;
}

function subscribeGuideRows(listener: () => void): () => void {
  rowListeners.add(listener);
  return () => {
    rowListeners.delete(listener);
  };
}

/** Re-renders when a guide row arrives or changes. */
export function useGuideRowsRevision(): number {
  return useSyncExternalStore(subscribeGuideRows, guideRowsRevision);
}

// ---------------------------------------------------------------------------------------------
// Whether guides go by city.

export const GUIDES_PER_CITY_KEY = 'guides.per_city';

const STORE_KEY = 'guides-per-city';
const OVERRIDE_KEY = 'guides-per-city-override';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-guides' }));

/** Where the value in force comes from. */
export type GuidesPerCitySource = 'override' | 'config' | 'default';

interface PerCityState {
  /** The synced config's value; null until one arrives (on this phone, for this account). */
  readonly synced: boolean | null;
  /** Developer tools' local override; null follows the config. */
  readonly override: boolean | null;
}

function restore(key: string): boolean | null {
  const saved = store().getString(key);
  return saved === 'on' ? true : saved === 'off' ? false : null;
}

let perCity: PerCityState | null = null;
const perCityListeners = new Set<() => void>();

function perCityState(): PerCityState {
  perCity ??= { synced: restore(STORE_KEY), override: restore(OVERRIDE_KEY) };
  return perCity;
}

function settlePerCity(next: PerCityState): void {
  perCity = next;
  for (const listener of perCityListeners) listener();
}

/** A `client_config` value as synced: JSON text (`true`), or the bare word. */
export function readGuidesPerCity(value: string | number | boolean | null | undefined): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** The synced config's value (`data/guides` feeds every change in here). */
export function applyGuidesPerCity(value: boolean): void {
  const now = perCityState();
  if (now.synced === value) return;
  store().set(STORE_KEY, value ? 'on' : 'off');
  settlePerCity({ ...now, synced: value });
}

/**
 * Developer tools' local override for this phone; null goes back to the config. Kept across
 * launches; "Start as a new user" clears it with the rest of this store.
 */
export function setGuidesPerCityOverride(value: boolean | null): void {
  if (value === null) store().remove(OVERRIDE_KEY);
  else store().set(OVERRIDE_KEY, value ? 'on' : 'off');
  settlePerCity({ ...perCityState(), override: value });
}

/** Signing out forgets the account's synced value; a developer override stays with the phone. */
export function resetGuidesPerCity(): void {
  store().remove(STORE_KEY);
  settlePerCity({ ...perCityState(), synced: null });
}

/**
 * Whether a screen with no trip (Explore, a place page, a vote) shows the guide of the
 * destination's own city: the override, else the synced config, else off. A trip's own guide is
 * chosen by the server and is not affected.
 */
export function guidesPerCity(): boolean {
  const now = perCityState();
  return now.override ?? now.synced ?? false;
}

function perCitySource(): GuidesPerCitySource {
  const now = perCityState();
  if (now.override !== null) return 'override';
  return now.synced === null ? 'default' : 'config';
}

function subscribePerCity(listener: () => void): () => void {
  perCityListeners.add(listener);
  return () => {
    perCityListeners.delete(listener);
  };
}

/** Re-renders (and re-runs the queries that take it) when the switch changes. */
export function useGuidesPerCity(): boolean {
  return useSyncExternalStore(subscribePerCity, guidesPerCity);
}

/** Where the value in force comes from (Developer tools). */
export function useGuidesPerCitySource(): GuidesPerCitySource {
  return useSyncExternalStore(subscribePerCity, perCitySource);
}
