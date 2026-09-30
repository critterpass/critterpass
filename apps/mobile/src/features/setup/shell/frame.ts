/**
 * What the setup screen hands each step: the trip's facts and the shell's shared props (which
 * step is on screen, which chips open, the sync state). A step adds its own title, line, tag,
 * content and actions and renders `<SetupShell {...frame.shell}>`.
 */
import type { SetupTrip } from '../data/setup-trip';
import type { SetupShellProps } from './setup-shell';

export type ShellFrame = Pick<
  SetupShellProps,
  | 'destination'
  | 'viewing'
  | 'doneSteps'
  | 'openable'
  | 'onSelectStep'
  | 'onBack'
  | 'sync'
  | 'status'
>;

export interface StepProps {
  readonly trip: SetupTrip;
  readonly shell: ShellFrame;
}
