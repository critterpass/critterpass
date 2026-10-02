/**
 * Where the lock-screen sheet's Boost button goes: the paywall's entry for this offer, registered
 * by the monetisation area together with the price it shows. Until it registers, the sheet
 * explains the perk and offers only the quiet way out.
 */
export interface LockScreenBoost {
  /** Opens the Boost purchase for the trip. */
  readonly open: (tripId: string) => void;
  /** The localised price on the button ("$12"), when the store has answered. */
  readonly price: () => string | null;
}

let boost: LockScreenBoost | null = null;

export function registerLockScreenBoost(next: LockScreenBoost): () => void {
  boost = next;
  return () => {
    if (boost === next) boost = null;
  };
}

export function lockScreenBoost(): LockScreenBoost | null {
  return boost;
}
