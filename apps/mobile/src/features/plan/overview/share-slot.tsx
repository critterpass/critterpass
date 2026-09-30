/**
 * The overview's SHARE pill slot. It stays empty until the read-only share link registers what
 * goes here, so the header never offers a share that does nothing.
 */
import type { ComponentType } from 'react';

export interface PlanShareSlotProps {
  readonly tripId: string;
}

let slot: ComponentType<PlanShareSlotProps> | null = null;

/** Fills the slot (once, at startup); returns a function that empties it again. */
export function registerPlanShareSlot(component: ComponentType<PlanShareSlotProps>): () => void {
  slot = component;
  return () => {
    if (slot === component) slot = null;
  };
}

export function PlanShareSlot({ tripId }: PlanShareSlotProps) {
  const Filled = slot;
  return Filled === null ? null : <Filled tripId={tripId} />;
}
