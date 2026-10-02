import { useLocalSearchParams } from 'expo-router';

import { FlightDisruptionScreen } from '@/features/trip/disruptions/flight/screen';

/** A flight delay, cancellation or diversion (3k-5): what the guide did and what needs a yes. */
export default function DisruptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlightDisruptionScreen id={id} />;
}
