import type { ReactNode } from 'react';

import { t } from '@lingui/core/macro';

export interface CheckViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly status: string;
  readonly state: 'loading' | 'ready';
  readonly title: string;
  readonly body: string;
  /** Shown instead of the cards: running, failed, or nothing to fix. */
  readonly notice: string | null;
  readonly cards: readonly IssueCardProps[];
  readonly know: readonly string[];
  readonly ask: ReactNode;
  readonly balance: { readonly label: string; readonly onPress: () => void } | null;
  readonly fixAll: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly reducedMotion: boolean;
}

export interface AskCardProps {
  readonly asker: string;
  readonly places: readonly string[];
  readonly onYes: () => void;
  readonly onNo: () => void;
}

export function askLine(asker: string, places: readonly string[]): string {
  const list = places.join(', ');
  return places.length === 0
    ? t({ id: 'plan.check.ask.linePlain', message: `${asker} asked if your saves should go in.` })
    : t({ id: 'plan.check.ask.line', message: `${asker} asked if ${list} should go in.` });
}

export interface IssueCardProps {
  readonly id: string;
  readonly tags: readonly { readonly label: string; readonly color: string }[];
  readonly title: string;
  readonly body: string;
  readonly summary: string | null;
  /** FIX for an organiser, SUGGEST for a member; null when there is nothing to do. */
  readonly fixLabel: string | null;
  readonly busy: boolean;
  readonly onFix: () => void;
  /** The too-far detail, open under the card. */
  readonly detail?: {
    readonly line: string;
    readonly useLabel: string;
    readonly onUse: (() => void) | null;
    /** "Keep it as it is": the card leaves the list. */
    readonly onKeep: () => void;
  } | null;
}
