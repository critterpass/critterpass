/**
 * The lock-screen sheet over the crew map (5a-6): asks the server once, as it opens, to put the
 * trip's meet-up on every member's lock screen, and shows what came back.
 */
import { LockScreenOfferSheet } from './lock-screen-offer-sheet';
import { useLockScreenOffer } from './use-lock-screen-offer';

export function LockScreenOfferScreen({ tripId }: { readonly tripId: string }) {
  return <LockScreenOfferSheet {...useLockScreenOffer(tripId)} />;
}
