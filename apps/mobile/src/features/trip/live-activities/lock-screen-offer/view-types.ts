import type { OfferFacts, OfferPhase } from './offer-model';

export interface LockScreenOfferSheetProps {
  readonly facts: OfferFacts;
  readonly phase: OfferPhase;
  /** The lock screen's clock in the preview ("16:38"). */
  readonly clock: string;
  /** The meet-up's time ("17:00"), in the trip's zone; null when no meet-up is set. */
  readonly meetTime: string | null;
  /** When it reaches the lock screens ("16:30"); null when that is now. */
  readonly startsTime: string | null;
  /** The Boost button, once the paywall has registered; null hides it. */
  readonly boost: { readonly price: string | null; readonly onPress: () => void } | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}
