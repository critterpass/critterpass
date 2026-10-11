/**
 * The place page (7e-1, 7e-2): the place from the device (so a saved destination's places open
 * offline), and inside a trip when it fits, its fact tiles, what is nearby and similar and where
 * the crew stands, from the api. ADD opens Add to plan (7f-1) at the slot it names.
 */
import { PlaceFurther } from './further';
import { PlaceDetailView } from './place-detail-view';
import { PlaceProfileSection } from './place-profile';
import { RemoveForEveryone } from './remove-for-everyone';
import { usePlaceDetail, type PlaceDetailInput } from './use-place-detail';

export type PlaceDetailScreenProps = PlaceDetailInput;

export function PlaceDetailScreen(props: PlaceDetailScreenProps) {
  const { view, further } = usePlaceDetail(props);
  return (
    <PlaceDetailView
      {...view}
      further={
        <>
          {further.profile === null ? null : (
            <PlaceProfileSection placeId={further.placeId} profile={further.profile} />
          )}
          <RemoveForEveryone
            tripId={props.tripId}
            placeId={further.placeId}
            name={further.name}
            organiser={further.organiser}
          />
          <PlaceFurther
            guide={further.guide}
            context={further.context}
            tip={further.tip}
            live={further.live}
            offers={further.offers}
            onPlace={further.onPlace}
            addPlace={further.addPlace}
          />
        </>
      }
    />
  );
}
