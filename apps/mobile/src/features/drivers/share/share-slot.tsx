/**
 * "A driver or guide" in the plan's share sheet: opens Share with your driver as a sheet over it.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import type { PlanShareSlotProps } from '@/features/plan';
import { Button } from '@/ui/premium';

import { driversRoute } from '../shared/routes';

export function DriverShareSlot({ tripId }: PlanShareSlotProps) {
  const { t } = useLingui();
  return (
    <Button
      label={t({ id: 'drivers.share.entry', message: 'A driver or guide' })}
      variant="secondary"
      onPress={() => router.push(driversRoute(tripId, 'share'))}
      testID="plan-share-driver"
    />
  );
}
