/**
 * A flight delay, cancellation or diversion (3k-5): its data and actions are `useFlightDisruption`.
 */
import { FlightView } from './flight-view';
import { useFlightDisruption } from './use-flight-disruption';

export function FlightDisruptionScreen({ id }: { readonly id: string }) {
  return <FlightView {...useFlightDisruption({ id })} />;
}
