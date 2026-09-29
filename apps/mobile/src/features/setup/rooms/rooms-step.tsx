/** The rooms step of trip setup. */
import { t } from '@lingui/core/macro';

import type { StepProps } from '../shell/frame';
import { SetupShell } from '../shell/setup-shell';

export function RoomsStep({ shell }: StepProps) {
  return (
    <SetupShell {...shell} title={t({ id: 'setup.rooms.title', message: 'Who sleeps where?' })} />
  );
}
