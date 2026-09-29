/** The budget step of trip setup. */
import { t } from '@lingui/core/macro';

import type { StepProps } from '../shell/frame';
import { SetupShell } from '../shell/setup-shell';

export function BudgetStep({ shell }: StepProps) {
  return (
    <SetupShell {...shell} title={t({ id: 'setup.budget.title', message: 'What feels comfy?' })} />
  );
}
