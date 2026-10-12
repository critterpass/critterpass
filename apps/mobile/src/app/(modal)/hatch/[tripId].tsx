import { t } from '@lingui/core/macro';
import { useLocalSearchParams } from 'expo-router';

import { HatchScreen } from '@/features/critters/hatch/hatch-screen';
import { PremiumHatchScene } from '@/features/critters/premium/hatch/hatch-scene';
import { premiumRoute } from '@/lib/premium-ui';
import { LoadingCritter } from '@/ui/premium';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' ? tripId : '';
}

function CurrentHatchRoute() {
  return <HatchScreen tripId={useTripId()} />;
}

function PremiumHatchRoute() {
  return (
    <HatchScreen
      tripId={useTripId()}
      View={PremiumHatchScene}
      loading={
        <LoadingCritter
          label={t({ id: 'critters.premium.hatch.loading', message: 'Your egg is hatching…' })}
          testID="critters-hatch-loading"
        />
      }
    />
  );
}

/** The egg hatch (3l-1), over whatever was on screen when the egg hatched. */
export default premiumRoute({ premium: PremiumHatchRoute, legacy: CurrentHatchRoute });
