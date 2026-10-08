/**
 * Asked before a crew's code is replaced: friends may already hold the old one, and it stops
 * working the moment the new one exists.
 */
import { t } from '@lingui/core/macro';

import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

export function RotateCodeConfirm({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmSheet
      title={t({ id: 'crew.settings.rotateTitle', message: 'Make a new code?' })}
      consequences={[
        t({
          id: 'crew.settings.rotateOld',
          message: 'The code and link you already shared stop working at once.',
        }),
        t({
          id: 'crew.settings.rotateNamed',
          message: 'Invites you sent to a named friend keep working.',
        }),
      ]}
      confirmLabel={t({ id: 'crew.settings.rotateConfirm', message: 'Replace the code' })}
      mode="button"
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID="crew-rotate-confirm"
    />
  );
}
