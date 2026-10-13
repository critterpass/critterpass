/**
 * What the setup screen hands each step: the trip's facts and the frame every step page shares
 * (which step is on screen, which steps open, the way back and the sync state). A step adds its
 * own headline, content and actions.
 */
import type { SetupTrip } from '../data/setup-trip';
import type { WizardStep } from './steps';

export interface SetupSync {
  readonly offline: boolean;
  readonly lastSyncedAt: Date | null;
  readonly now: Date;
}

export interface ShellFrame {
  readonly destination: string;
  readonly viewing: WizardStep;
  readonly doneSteps: ReadonlySet<WizardStep>;
  readonly openable: ReadonlySet<WizardStep>;
  readonly onSelectStep: (step: WizardStep) => void;
  readonly onBack?: (() => void) | undefined;
  readonly sync: SetupSync;
}

export interface StepProps {
  readonly trip: SetupTrip;
  readonly shell: ShellFrame;
}

/** A setup sheet before its trip is read (`loading`), or for someone with no part in it. */
export interface SheetWaitingProps {
  readonly state: 'loading' | 'missing';
  /** The sheet's own title, as it reads once loaded. */
  readonly title: string;
  readonly onDismiss: () => void;
  readonly testID: string;
}
