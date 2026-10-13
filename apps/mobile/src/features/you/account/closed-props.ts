export type ClosedMode = 'closed' | 'erased' | 'restore';

export type ClosedProblem = 'incomplete' | 'restart_failed' | 'not_restored';

export interface ClosedViewProps {
  readonly mode: ClosedMode;
  /** When the account is erased (ISO); absent for `erased`. */
  readonly purgeAt: string | null;
  /** The day it was closed, printed on the stamp. */
  readonly closedOn: Date;
  readonly busy: boolean;
  readonly problem: ClosedProblem | null;
  /** `closed`: sign in again to keep it. `restore`: restore it now. */
  readonly onKeep?: () => void;
  readonly onClose: () => void;
}
