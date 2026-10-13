import type { DeletionPreflight, DeletionReason } from '@cp/domain';

export type DeleteStep = 'review' | 'hold';

export type DeleteProblem =
  /** The server did not close the account: nothing on the phone was changed. */
  'not_closed';

export interface DeleteViewProps {
  readonly step: DeleteStep;
  readonly online: boolean;
  readonly busy: boolean;
  readonly passPlus: boolean;
  /** The server's preflight; null until it answers (or when it cannot be reached). */
  readonly preflight: DeletionPreflight | null;
  readonly reason: DeletionReason | null;
  readonly problem: DeleteProblem | null;
  readonly onContinue: () => void;
  readonly onReason: (reason: DeletionReason | null) => void;
  /** Called only when the hold completes. */
  readonly onDelete: () => void;
  readonly onKeep: () => void;
  readonly onBack?: () => void;
  readonly onSettle?: () => void;
  readonly onManageSubscription?: () => void;
  /** "Download my data first", with the export's state under it. */
  readonly download?: { readonly line: string; readonly onPress: () => void };
}
