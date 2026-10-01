/**
 * The trip's guide for the wallet's lines ("Chà Vá pings you when boarding opens.", "Chà Vá is
 * reading it…"): the screens provide it from the trip they show; the views read it, and without a
 * trip (or in a lab scene) it is the default guide, Tokek.
 */
import { createContext, useContext, type ReactNode } from 'react';

import { GUEST_GUIDE, useTripGuide, type TripGuide } from '../supplier/data/use-trip-guide';

const WalletGuideContext = createContext<TripGuide>(GUEST_GUIDE);

export function WalletGuideProvider({
  tripId,
  children,
}: {
  readonly tripId: string | null;
  readonly children: ReactNode;
}) {
  const guide = useTripGuide(tripId);
  return <WalletGuideContext.Provider value={guide}>{children}</WalletGuideContext.Provider>;
}

export function useWalletGuide(): TripGuide {
  return useContext(WalletGuideContext);
}
