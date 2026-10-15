import type { ThreadPhase } from './thread-phase';
import type { GuideId } from '@/lib/navigation/active-guide';

export interface VendorThreadCardProps {
  readonly vendor: string;
  readonly phase: ThreadPhase;
  /** The status line from the copy rules ("Draft ready — send?", "Sent 10:45, waiting", …). */
  readonly line: string;
  /** Verbatim: our approved text, or the place's reply exactly as received. */
  readonly body: string | null;
  /** When the desk sends an approved message ("The desk sends it between 07:00 and 23:00 SGT"). */
  readonly note?: string | null;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onSend?: () => void;
  readonly onShare?: () => void;
  readonly testID?: string;
}

export type DraftOutcome =
  | { readonly kind: 'editing' }
  | { readonly kind: 'approved'; readonly note: string }
  | { readonly kind: 'self_send' };

export interface VendorDraftCardProps {
  readonly vendor: string;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly outcome: DraftOutcome;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSend: () => void;
  readonly onShare: () => void;
  readonly onDone: () => void;
}

export interface OffersViewProps {
  readonly title: string;
  readonly guide: string;
  readonly loading: boolean;
  readonly cards: readonly (OfferCardProps & { readonly key: string })[];
  /** Why the cards are links, or that nothing can be opened right now. */
  readonly notice?: string | null;
  readonly onBack?: () => void;
}

export interface OfferAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly testID?: string;
}

export interface OfferCardProps {
  /** "Klook", "Viator". */
  readonly supplier: string;
  readonly title: string;
  /** The title and lines are the supplier's own words (shown under THEIR WORDS). */
  readonly verbatim: boolean;
  readonly lines?: readonly string[];
  /** "seen 09:10 on Viator". */
  readonly seen?: string | null;
  readonly note?: { readonly guide: GuideId; readonly name: string; readonly line: string } | null;
  /** Truthful status line from the copy rules ("4 seats held until 14:20"). */
  readonly status?: string | null;
  /** The supplier's hold deadline, only while it reports a hold. */
  readonly holdUntil?: string | null;
  readonly onHoldExpired?: () => void;
  readonly primary: OfferAction;
  readonly secondary?: OfferAction | null;
  /** Shown under the buttons when the last tap did not go through. */
  readonly error?: string | null;
  readonly testID?: string;
}
