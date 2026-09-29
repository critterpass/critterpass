/** The must-dos step of trip setup. */
import { t } from '@lingui/core/macro';

import type { StepProps } from '../shell/frame';
import { SetupShell } from '../shell/setup-shell';

export function MustDosStep({ shell }: StepProps) {
  return (
    <SetupShell {...shell} title={t({ id: 'setup.mustDos.title', message: 'One must-do each' })} />
  );
}
