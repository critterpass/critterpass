/**
 * The saved hub's SAVED PLANS section. It stays empty (and the section hidden) until the area
 * that owns shared crew plans registers what goes here.
 */
import type { ComponentType } from 'react';

let slot: ComponentType | null = null;

/** Fills the slot (once, at startup); returns a function that empties it again. */
export function registerSavedPlansSlot(component: ComponentType): () => void {
  slot = component;
  return () => {
    if (slot === component) slot = null;
  };
}

export function SavedPlansSlot() {
  const Filled = slot;
  return Filled === null ? null : <Filled />;
}
