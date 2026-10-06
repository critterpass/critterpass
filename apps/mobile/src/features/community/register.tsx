/**
 * Community joins the app: its screens in the navigation registry, and the plan overview's SHARE
 * pill, which opens Share the plan. Imported once by the root layout.
 */
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';

import { registerPlanShareSlot } from '@/features/plan';
import { PillButton } from '@/ui/buttons/PillButton';

import { communityRoutes } from './routes';

function SharePill({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const router = useRouter();
  return (
    <PillButton
      size="sm"
      variant="secondary"
      label={t({ id: 'community.sharePill', message: 'Share' })}
      onPress={() => router.push(communityRoutes.publish(tripId))}
      testID="plan-share-pill"
    />
  );
}

registerPlanShareSlot(SharePill);
