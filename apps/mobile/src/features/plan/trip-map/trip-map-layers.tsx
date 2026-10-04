/**
 * The map under the trip map's sheet and the open day map (7a, 7b-2): the region's tiles, the
 * places as layers (saved icons, the guide's dots), every day's route with the chosen day traced
 * from the stay, and the one label on the map: the picked stop or place.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import {
  MapLabel,
  PlaceDotsLayer,
  PlanningMapCanvas,
  StopRouteLayer,
  type MapRegion,
  type PlanningCamera,
  type RouteDay,
} from '@/ui/map/planning';

import type { MapPlace } from './map-places';

export type Picked =
  | { readonly kind: 'stop'; readonly id: string }
  | { readonly kind: 'place'; readonly id: string }
  | null;

export interface PickedStop {
  readonly lat: number;
  readonly lng: number;
  readonly title: string;
  /** "Stop 3 · 14:00 · rain likely". */
  readonly subtitle: string;
  readonly color: string;
}

export interface TripMapLayersProps {
  readonly camera: PlanningCamera;
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly destinationSlug: string | null;
  readonly placeName: string | null;
  readonly regionUri: string | null;
  readonly stay: readonly [number, number] | null;
  readonly places: readonly MapPlace[];
  readonly days: readonly RouteDay[];
  readonly chosenDayNo: number | null;
  readonly pickedStop: PickedStop | null;
  readonly pickedPlace: MapPlace | null;
  readonly onPick: (picked: Picked) => void;
  readonly onRegion: (region: MapRegion) => void;
  /** Anything else drawn on the map (a preview route). */
  readonly children?: ReactNode;
  /** The MapLibre mark; the attribution "i" stays either way. */
  readonly logo?: boolean;
}

export function TripMapLayers(props: TripMapLayersProps) {
  const { t } = useLingui();
  const { camera, pickedStop, pickedPlace } = props;
  const place = pickedPlace;
  return (
    <PlanningMapCanvas
      initialCenter={[props.center[0], props.center[1]]}
      initialZoom={props.zoom}
      destinationSlug={props.destinationSlug}
      placeName={props.placeName}
      localRegionUri={props.regionUri}
      stay={props.stay === null ? null : [props.stay[0], props.stay[1]]}
      cameraRef={camera.cameraRef}
      onRegionChange={props.onRegion}
      onPressMap={() => props.onPick(null)}
      {...(props.logo === undefined ? {} : { logo: props.logo })}
    >
      <PlaceDotsLayer
        places={props.places}
        onSelectPlace={(id) => props.onPick({ kind: 'place', id })}
        onPressCluster={(cluster) => camera.openCluster(cluster.center, cluster.expansionZoom)}
      />
      <StopRouteLayer
        days={props.days}
        chosenDayNo={props.chosenDayNo}
        stay={props.stay}
        onSelectStop={(id) => props.onPick({ kind: 'stop', id })}
      />
      {props.children}
      {place === null ? null : (
        <MapLabel
          lngLat={[place.lng, place.lat]}
          title={place.name}
          subtitle={
            place.tier === 'saved'
              ? t({ id: 'plan.tripMap.label.saved', message: 'Saved by the crew' })
              : t({ id: 'plan.tripMap.label.pick', message: 'A pick for this trip' })
          }
          lift={18}
          testID="trip-map-place-label"
        />
      )}
      {pickedStop === null ? null : (
        <MapLabel
          lngLat={[pickedStop.lng, pickedStop.lat]}
          title={pickedStop.title}
          subtitle={pickedStop.subtitle}
          tone={{ fill: pickedStop.color }}
          testID="trip-map-stop-label"
        />
      )}
    </PlanningMapCanvas>
  );
}
