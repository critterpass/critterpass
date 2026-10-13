import type { ReactNode } from 'react';

export interface ChangeRow {
  readonly key: string;
  readonly dayTag: string;
  readonly dayColor: string;
  readonly title: string;
  readonly detail: string;
  readonly accepted: boolean;
}

export interface ChangesReviewViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onlyYou: string | null;
  readonly title: string;
  readonly summary: string;
  readonly rows: readonly ChangeRow[];
  readonly onToggle: ((key: string, accepted: boolean) => void) | null;
  readonly needsYou: readonly NeedsYouRow[];
  readonly totals: ReactNode;
  readonly send: {
    readonly label: string;
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  /** An organiser's other way: send it to the crew as a vote instead of putting it straight in. */
  readonly ask?: {
    readonly label: string;
    readonly disabled: boolean;
    readonly onPress: () => void;
  } | null;
  readonly personal: { readonly busy: boolean; readonly onPress: () => void } | null;
  readonly vote: {
    readonly line: string;
    readonly canVote: boolean;
    readonly onYes: () => void;
    readonly onNo: () => void;
  } | null;
  readonly notice: string | null;
  /** Once the set is in: the way to the day it changed. */
  readonly seeDay?: { readonly label: string; readonly onPress: () => void } | null;
}

export interface NeedsYouRow {
  readonly key: string;
  readonly name: string;
  readonly line: string;
  /** Shown under the row once SEE is tapped (a stop that would have to move). */
  readonly explainer: string | null;
  readonly onSee: () => void;
}
