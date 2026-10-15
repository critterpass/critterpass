/**
 * The iOS first-launch paste offer over the launch screen: the premium offer page, with the system
 * paste control so the pasteboard is read only when the person taps it.
 */
import { PremiumPasteOffer } from '@/features/onboarding';
import type { PasteOfferControls } from '@/lib/links/SplashResolveGate';

export interface PasteLinkOfferProps extends PasteOfferControls {
  /** The offer is on screen: the launch splash can go. */
  readonly onShown: () => void;
}

export function PasteLinkOffer(props: PasteLinkOfferProps) {
  return <PremiumPasteOffer {...props} />;
}
