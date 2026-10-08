/**
 * A place's page (7e-1) once the place is known, from the phone or the api; the waiting, missing
 * and offline states while it is not. Partner offers are opened on their own screen and never read
 * here.
 */

import { goBackOr } from '@/lib/navigation/back';
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

const goBack = () => goBackOr();

export function PlaceScreen(props: PlaceScreenProps) {
  const trip = props.tripId ?? null;
  const facts = useTripFacts(trip, props.placeId);
  const place = usePlaceRow(props.placeId, props.destinationId ?? facts.destinationId);
  if (place.kind !== 'ready') return <PlaceUnavailable state={place} onBack={goBack} />;
  return (
    <PlaceDetailScreen
      placeId={props.placeId}
      row={place.row}
      profile={place.profile}
      tripId={trip}
      onBack={goBack}
    />
  );
}
