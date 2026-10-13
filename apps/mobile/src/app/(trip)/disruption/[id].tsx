import { useLocalSearchParams } from 'expo-router';

import { FlightDisruptionPremium } from '@/features/trip/premium/day-change/FlightDisruptionPremium';

/** A flight delay, cancellation or diversion (3k-5, 6.09): what the guide did and what needs a yes. */
export default function DisruptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlightDisruptionPremium id={id} />;
}
