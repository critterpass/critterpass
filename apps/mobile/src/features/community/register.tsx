/**
 * Community joins the app: its screens in the navigation registry, and the plan share sheet's Share
 * pill, which opens Share the plan. Imported once by the root layout.
 */
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';

import { registerPremiumPlanShareSlot } from '@/features/plan';
import { Button } from '@/ui/premium';

import { communityRoutes, registerCommunityScreens } from './routes';

function SharePill({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const router = useRouter();
  return (
    <Button
      size="small"
      variant="secondary"
      label={t({ id: 'community.sharePill', message: 'Share' })}
      onPress={() => router.push(communityRoutes.publish(tripId))}
      testID="plan-share-pill"
    />
  );
}

registerCommunityScreens();
registerPremiumPlanShareSlot(SharePill);
