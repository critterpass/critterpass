import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

/** A design screen id from `docs/design-renders/screens.json`, e.g. `3c-9`. */
export type ScreenId = string;

export type ScreenParams = Readonly<Record<string, string>>;

/** A static href, or a builder for screens whose href needs params (a trip id, a place id). */
export type ScreenRoute = Href | ((params: ScreenParams) => Href);

const routes = new Map<ScreenId, ScreenRoute>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

/**
 * Area phases register their screens from `src/features/<area>/routes.ts` (no edits to shared
 * files). Returns an unregister function; re-registering an id replaces it (fast refresh).
 */
export function registerScreens(entries: Readonly<Record<ScreenId, ScreenRoute>>): () => void {
  const ids = Object.keys(entries);
  for (const id of ids) {
    const route = entries[id];
    if (route !== undefined) routes.set(id, route);
  }
  notify();
  return () => {
    for (const id of ids) {
      if (routes.get(id) === entries[id]) routes.delete(id);
    }
    notify();
  };
}

export function isScreenRegistered(id: ScreenId): boolean {
  return routes.has(id);
}

/** The href for a registered screen, or `undefined` while the owning phase hasn't registered it. */
export function hrefFor(id: ScreenId, params: ScreenParams = {}): Href | undefined {
  const route = routes.get(id);
  if (route === undefined) return undefined;
  return typeof route === 'function' ? route(params) : route;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when registrations change; `undefined` while `id` is unregistered. */
export function useScreenHref(id: ScreenId, params?: ScreenParams): Href | undefined {
  useSyncExternalStore(subscribe, () => version);
  return hrefFor(id, params);
}
