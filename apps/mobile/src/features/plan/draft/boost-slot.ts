/**
 * Where "Boost" on the last-free-redraft interstitial and the redrafts-spent state goes: the
 * paywall's `redraft_last` entry, registered by the monetisation area. Until it registers, those
 * screens say redrafts reset every trip and offer no boost button.
 */
export type RedraftBoost = (tripId: string) => void;

let boost: RedraftBoost | null = null;

export function registerRedraftBoost(next: RedraftBoost): () => void {
  boost = next;
  return () => {
    if (boost === next) boost = null;
  };
}

export function redraftBoost(): RedraftBoost | null {
  return boost;
}
