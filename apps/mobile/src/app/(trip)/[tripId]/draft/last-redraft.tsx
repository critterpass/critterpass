import { t } from '@lingui/core/macro';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LastRedraftPremium } from '@/features/monetize/premium/last-redraft-premium';
import { LastRedraftSheet, parseReasons, useLastRedraft } from '@/features/plan/draft';
import { premiumRoute } from '@/lib/premium-ui';
import { LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';

function useLastRedraftParams() {
  const params = useLocalSearchParams<{
    tripId: string;
    day: string;
    reasons?: string;
    note?: string;
    free?: string;
  }>();
  return {
    tripId: params.tripId,
    day: Number(params.day) || 1,
    reasons: parseReasons(params.reasons),
    note: params.note ?? '',
    free: params.free === '1',
  };
}

/** The last-free-redraft interstitial, holding the redraft it will send. */
function CurrentLastRedraftRoute() {
  return <LastRedraftSheet {...useLastRedraftParams()} />;
}

/** The last free redraft (9.18) in the premium look, sending the same held redraft. */
function PremiumLastRedraftRoute() {
  const theme = usePremiumTheme();
  const last = useLastRedraft(useLastRedraftParams());
  return (
    <View style={{ padding: theme.space.gutter, gap: theme.space.gap12 }}>
      {last.trip == null ? (
        <LoadingCritter
          label={t({ id: 'plan.premium.draft.loading', message: 'Loading the draft' })}
        />
      ) : (
        <LastRedraftPremium
          place={last.trip.destinationName}
          limit={last.limit}
          boostEach={null}
          onUse={last.use}
          {...(last.boost === undefined ? {} : { onBoost: last.boost })}
        />
      )}
      {last.problem === null ? null : (
        <Text variant="caption" color={theme.color.destructive.text} testID="last-redraft-problem">
          {last.problem}
        </Text>
      )}
    </View>
  );
}

export default premiumRoute({
  premium: PremiumLastRedraftRoute,
  legacy: CurrentLastRedraftRoute,
});
