/**
 * The plan chip in the Settings header ("PASS+ · YEARLY ›"): what the account is on, opening Your
 * plan. The monetisation area registers how to read it; until it does, Settings shows no chip.
 */
export interface PlanChip {
  readonly label: string;
  readonly onPress: () => void;
}

/** A hook, so the chip follows the synced plan rows. Null while the plan is not read yet. */
export type UsePlanChip = () => PlanChip | null;

const none: UsePlanChip = () => null;
let registered: UsePlanChip = none;

/** Registered once at startup, before any screen draws, so the hook a screen calls never changes. */
export function registerPlanChip(next: UsePlanChip): () => void {
  registered = next;
  return () => {
    if (registered === next) registered = none;
  };
}

export function usePlanChip(): PlanChip | null {
  const useChip = registered;
  return useChip();
}
