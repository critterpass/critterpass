/**
 * "A driver or guide" in the plan's SHARE sheet: opens Share with your driver over it.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import type { PlanShareSlotProps } from '@/features/plan/overview/share-slot';
import { PillButton } from '@/ui/buttons/PillButton';

import { DriverShareSheet } from './share-sheet';

export function DriverShareSlot({ tripId }: PlanShareSlotProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PillButton
        label={t({ id: 'drivers.share.entry', message: 'A driver or guide' })}
        variant="secondary"
        block
        onPress={() => setOpen(true)}
        testID="plan-share-driver"
      />
      {open && <DriverShareSheet tripId={tripId} onClose={() => setOpen(false)} />}
    </>
  );
}
