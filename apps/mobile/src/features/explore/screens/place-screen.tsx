/**
 * A place's page (7e-1) once the place is on the device; the waiting and missing states while it
 * is not. Partner offers are opened on their own screen and never read here.
 */
import { router } from 'expo-router';

import { useTripFacts } from '../place-queries';
import { PlaceDetailScreen } from '../place-detail/place-detail-screen';
import { PlaceUnavailable } from '../place-detail/place-unavailable';
import { usePlaceRow } from '../place-detail/remote-place';

export interface PlaceScreenProps {
  readonly placeId: string;
  /** The destination the place was opened from, so its places sync before the row is known. */
  readonly destinationId?: string | undefined;
  readonly tripId?: string | undefined;
}

const goBack = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/');
};

export function PlaceScreen(props: PlaceScreenProps) {
  const trip = props.tripId ?? null;
  const facts = useTripFacts(trip, props.placeId);
  const place = usePlaceRow(props.placeId, props.destinationId ?? facts.destinationId);
  if (place.kind !== 'ready') return <PlaceUnavailable state={place} onBack={goBack} />;
  return (
    <PlaceDetailScreen placeId={props.placeId} row={place.row} tripId={trip} onBack={goBack} />
  );
}
