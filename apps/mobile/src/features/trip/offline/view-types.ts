import type { QueuedItemSheetProps } from './queued-item-sheet';
import type { RejectedCommand } from '@/data/status/use-rejected-commands';
import type { GuideId } from '@/ui/people/GuideLine';
import type { MessageDescriptor } from '@lingui/core';
import type { ReactNode } from 'react';

export interface OfflineViewProps {
  readonly card: OfflineCardProps;
  readonly stillWorks: readonly StillWorksLine[];
  readonly sends: readonly SendsLine[];
  readonly conflicts: readonly RejectedCommand[];
  /** Back online and lifted: only the conflicts are left to show. */
  readonly conflictsOnly?: boolean;
  /** Opens the offline page; null on that page. */
  readonly onOpenOffline?: (() => void) | null;
  /** "Last synced 03:02"; null before the first sync. */
  readonly lastSynced: string | null;
  readonly onOpenPlan: (() => void) | null;
  readonly onOpenSend: (opId: string) => void;
  readonly onDismissConflict: (opId: string) => void;
  readonly sheet?: ReactNode;
  /** The waiting write opened from the sends list, for a UI that draws its own sheet. */
  readonly queued?: QueuedItemSheetProps | null;
}

export interface SendsLine {
  readonly opId: string;
  readonly summary: MessageDescriptor;
  readonly sent: boolean;
  readonly tickIndex: number;
}

export interface StillWorksLine {
  readonly key: string;
  readonly text: string;
  /** Not on the phone (no space, no signal while saving). */
  readonly missing?: boolean;
}

export type SignalChip = 'offline' | 'weak' | 'back' | 'online';

export interface OfflineCardProps {
  readonly eyebrow: string;
  readonly headline: string;
  readonly line: string;
  readonly chip: SignalChip;
  readonly guide: GuideId;
}
