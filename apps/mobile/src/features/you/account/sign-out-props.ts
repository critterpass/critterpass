export interface SignOutViewProps {
  /** `null` while it is not yet known whether the pass is saved: nothing can be confirmed then. */
  readonly saved: boolean | null;
  readonly busy: boolean;
  /** The phone could not be fully cleared, or would not restart. */
  readonly problem: 'incomplete' | 'restart_failed' | null;
  readonly onSignOut: () => void;
  readonly onSavePass: () => void;
  readonly onBack?: () => void;
}
