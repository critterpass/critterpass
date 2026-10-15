import type { CandidateView } from '../candidates/candidate-model';
import type { ScanState } from '../scan/use-booking-scan';

export type ImportChannel = 'forward' | 'scan' | 'paste';

export interface AddBookingViewProps {
  readonly address: string | null;
  readonly candidates: readonly CandidateView[];
  readonly splits: Readonly<Record<string, boolean>>;
  readonly assembling: ReadonlySet<string>;
  /** How each resolved card leaves. */
  readonly leaving: Readonly<Record<string, 'add' | 'ignore'>>;
  readonly scan: ScanState;
  readonly mailboxConnected: boolean;
  readonly noTrip: boolean;
  readonly tz?: string | undefined;
  readonly onBack: () => void;
  readonly onChannel: (channel: ImportChannel) => void;
  readonly onCopy: (address: string) => Promise<void>;
  readonly onSplit: (id: string, next: boolean) => void;
  readonly onAdd: (id: string) => void;
  readonly onIgnore: (id: string) => void;
  readonly onByHand: (id: string) => void;
  /** Adding by hand with nothing read first. */
  readonly onTypeIn: () => void;
  readonly onMailbox: () => void;
  /** Enter the code an unknown forwarding address was emailed. */
  readonly onLinkCode: () => void;
  /** Mail the crew address holds from an unlinked address: the card replaces the quiet link. */
  readonly heldMail?: number;
  /** A code for the held mail was emailed and is still good; otherwise the card offers paste. */
  readonly heldMailCodeSent?: boolean;
}
