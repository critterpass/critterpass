import type { StormModel, StormOptionId } from './model';
import type { GuideStickerId } from '@/ui/premium/stickers/guides';

export interface StormViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: StormModel | null;
  /** The storm's title and the guide's line, in the reader's language. */
  readonly title: string;
  readonly line: string;
  readonly tz: string;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly offline: boolean;
  readonly people: readonly { readonly id: string; readonly name: string }[];
  /** The original booker of the booked seat, when there is one. */
  readonly booker: { readonly id: string; readonly name: string; readonly me: boolean } | null;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onVote: (option: StormOptionId) => void;
  readonly onConfirmPay: () => void;
}
