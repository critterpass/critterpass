/// <reference types="expo/types/metro-require" />
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { Fixture, GallerySettings } from './types';

/**
 * Fixture registry for the dev gallery. Component families register their states from
 * `src/ui/**\/*.fixtures.tsx` files, which only the `(dev)` gallery routes load (via
 * `loadAllFixtures`); nothing in the production bundle imports this module or a fixture file.
 */
const fixtures = new Map<string, Map<string, Fixture>>();
const fixtureListeners = new Set<() => void>();
let version = 0;

function notifyFixtures(): void {
  version += 1;
  fixtureListeners.forEach((listener) => listener());
}

/** Registers (or, on fast refresh, replaces) one state of one component. */
export function registerFixture(component: string, state: string, render: () => ReactNode): void {
  const states = fixtures.get(component) ?? new Map<string, Fixture>();
  states.set(state, { component, state, render });
  fixtures.set(component, states);
  notifyFixtures();
}

export function listComponents(): readonly string[] {
  return [...fixtures.keys()].sort((a, b) => a.localeCompare(b));
}

export function fixturesFor(component: string): readonly Fixture[] {
  return [...(fixtures.get(component)?.values() ?? [])];
}

export function allFixtures(): readonly Fixture[] {
  return listComponents().flatMap((component) => fixturesFor(component));
}

/** Re-renders the caller whenever a fixture registers; returns the registry version. */
export function useFixtureRegistry(): number {
  return useSyncExternalStore(
    (listener) => {
      fixtureListeners.add(listener);
      return () => fixtureListeners.delete(listener);
    },
    () => version,
  );
}

let fixturesLoaded = false;

/**
 * Loads every `*.fixtures.tsx` under `src/ui` once. Metro resolves `require.context` at bundle
 * time; Jest has no `require.context`, so suites import the fixture files they cover directly.
 */
export function loadAllFixtures(): void {
  if (fixturesLoaded) return;
  fixturesLoaded = true;
  try {
    const context = require.context('..', true, /\.fixtures\.tsx$/);
    context.keys().forEach((key) => {
      context(key);
    });
  } catch (error) {
    if (typeof require.context === 'function') throw error;
  }
}

let settings: GallerySettings = { fontScale: 1, contrast: 'standard' };
const settingsListeners = new Set<() => void>();

export function setGallerySettings(next: Partial<GallerySettings>): void {
  settings = { ...settings, ...next };
  settingsListeners.forEach((listener) => listener());
}

export function useGallerySettings(): GallerySettings {
  return useSyncExternalStore(
    (listener) => {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    () => settings,
  );
}
