/**
 * Where the crew map's gate sends people: the paywall's `live_map` entry, registered by the
 * monetisation area (its teaser). Until it registers, the gate card explains and offers no button.
 * Also the lock-screen Live Activity starter, registered by the Live Activity area.
 */
export type LiveMapPaywall = (tripId: string) => void;
export type LockScreenStarter = (tripId: string) => void;

let paywall: LiveMapPaywall | null = null;
let lockScreen: LockScreenStarter | null = null;

export function registerLiveMapPaywall(next: LiveMapPaywall): () => void {
  paywall = next;
  return () => {
    if (paywall === next) paywall = null;
  };
}

export function liveMapPaywall(): LiveMapPaywall | null {
  return paywall;
}

export function registerLockScreenStarter(next: LockScreenStarter): () => void {
  lockScreen = next;
  return () => {
    if (lockScreen === next) lockScreen = null;
  };
}

export function lockScreenStarter(): LockScreenStarter | null {
  return lockScreen;
}
