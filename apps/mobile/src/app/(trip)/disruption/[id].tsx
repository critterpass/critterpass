import { useLocalSearchParams } from 'expo-router';

import { FlightDisruptionScreen } from '@/features/trip/disruptions/flight/screen';
import { FlightDisruptionPremium } from '@/features/trip/premium/day-change/FlightDisruptionPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** A flight delay, cancellation or diversion (3k-5, 6.09): what the guide did and what needs a yes. */
export default function DisruptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const premium = usePremiumUi();
  return premium ? <FlightDisruptionPremium id={id} /> : <FlightDisruptionScreen id={id} />;
}
