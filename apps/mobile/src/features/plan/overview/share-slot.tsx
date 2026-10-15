/**
 * The plan share sheet's slot: what other areas offer beside sending the plan (the read-only share
 * link's Share pill, a driver or guide), in the order they registered. Empty until one registers,
 * so the sheet never offers a share that does nothing.
 */
import { Fragment, useSyncExternalStore, type ComponentType } from 'react';

export interface PlanShareSlotProps {
  readonly tripId: string;
}

let slots: readonly ComponentType<PlanShareSlotProps>[] = [];
const listeners = new Set<() => void>();

function changed(next: readonly ComponentType<PlanShareSlotProps>[]): void {
  slots = next;
  for (const listener of listeners) listener();
}

/** Adds an entry to the slot (once, at startup); returns a function that takes it out again. */
export function registerPremiumPlanShareSlot(
  component: ComponentType<PlanShareSlotProps>,
): () => void {
  if (!slots.includes(component)) changed([...slots, component]);
  return () => changed(slots.filter((slot) => slot !== component));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function PremiumPlanShareSlot({ tripId }: PlanShareSlotProps) {
  const entries = useSyncExternalStore(subscribe, () => slots);
  return (
    <>
      {entries.map((Entry, index) => (
        <Fragment key={index}>
          <Entry tripId={tripId} />
        </Fragment>
      ))}
    </>
  );
}
