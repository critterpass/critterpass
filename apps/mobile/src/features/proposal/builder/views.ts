import type { ComponentType } from 'react';

import type { ProposalFormat } from '@cp/domain';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import type { BuilderConfig } from './model';
import { type GuideStickerId } from '@/ui/avatar/guides';
import type { CrewPerson } from '../data/trip';
import type { ProposalVersion } from '../data/proposal';

/** The builder's four faces; the logic stays in the builder screen. */
export interface BuilderViews {
  readonly Builder: ComponentType<BuilderViewProps>;
  readonly Alone: ComponentType<AloneViewProps>;
  readonly Sent: ComponentType<SendProgressProps>;
  readonly ReplyBy: ComponentType<ReplyBySheetProps>;
}

export interface StayRow {
  readonly key: string;
  readonly title: string;
  readonly freeCancelUntil: string | null;
}

export interface BuilderViewProps {
  readonly locale: string;
  readonly guideName: string;
  readonly guide: GuideId;
  readonly destination: string;
  readonly config: BuilderConfig;
  readonly headline: string;
  /** "$1,310 each", or null before the trip is priced. */
  readonly price: string | null;
  readonly replyByLabel: string;
  readonly stays: readonly StayRow[];
  /** Recipients whose version is written, for PREVIEW AS. */
  readonly previews: readonly { readonly uid: string; readonly name: string }[];
  readonly recipients: number;
  readonly offline: boolean;
  /** Why SEND is off, or null when it can go. */
  readonly blocked: string | null;
  /** What the plan check still says to fix, with the way to it; null when nothing. */
  readonly issues?: { readonly line: string; readonly onOpen: (() => void) | undefined } | null;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onFormat: (format: ProposalFormat) => void;
  readonly onShowCost: (on: boolean) => void;
  readonly onPersonal: (on: boolean) => void;
  readonly onReplyBy: () => void;
  readonly onPreview: (uid: string) => void;
  readonly onSend: () => void;
}

export interface AloneViewProps {
  readonly guide: GuideStickerId;
  readonly destination: string;
  /** "Oct 2–4", or empty before the dates are set. */
  readonly dates: string;
  /** A trip started for one: lock in first, inviting second. */
  readonly solo?: boolean;
  readonly offline: boolean;
  readonly locking: boolean;
  readonly onBack: () => void;
  readonly onLock: () => void;
  readonly onInvite: () => void;
}

export interface ReplyBySheetProps {
  readonly locale: string;
  readonly choices: readonly Date[];
  /** The deadline the guide would pick, when there is one. */
  readonly fallback: Date | null;
  readonly value: string | null;
  /** The earliest free cancellation of a booked stay, which bounds every choice. */
  readonly freeCancelUntil: string | null;
  readonly onPick: (value: string | null) => void;
  readonly onClose: () => void;
}

export interface SendProgressProps {
  readonly guide: GuideStickerId;
  /** What went out, as the builder drew it. */
  readonly format: ProposalFormat;
  readonly destination: string;
  readonly headline: string;
  readonly price: string | null;
  readonly guideName: string;
  readonly recipients: readonly CrewPerson[];
  readonly versions: readonly ProposalVersion[];
  readonly onTracker: () => void;
}
