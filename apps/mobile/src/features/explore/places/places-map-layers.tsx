/**
 * What the places map draws (7c-1, 7c-2), inside `PlanningMapCanvas`: the plan's days as numbered
 * routes in their colours (the lead day at full strength), saved icons and Tokek's lone dots as one
 * layer, Tokek's gathered dots as count bubbles, and the one label over the picked place.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { MapLabel, PlaceDotsLayer, StopRouteLayer, type PlaceDot } from '@/ui/map/planning';

import { ClusterBubble } from './cluster-bubble';
import type { DotCluster } from './place-clusters';
import type { PlanRouteDay } from './plan-routes';
import type { HubPlace } from './places-model';

export interface PlacesMapLayersProps {
  readonly dots: readonly PlaceDot[];
  readonly clusters: readonly DotCluster[];
  readonly routes: readonly PlanRouteDay[];
  /** The day at full strength; null draws every day at full, -1 every day at half (filtered). */
  readonly leadDayNo: number | null;
  readonly stay: readonly [number, number] | null;
  readonly focused: HubPlace | null;
  readonly labelSubtitle: string;
  readonly onPick: (id: string) => void;
  readonly onCluster: (cluster: DotCluster) => void;
}

export function PlacesMapLayers(props: PlacesMapLayersProps) {
  const { i18n } = useLingui();
  const { focused } = props;
  return (
    <>
      <StopRouteLayer
        id="cp-places-routes"
        days={props.routes}
        chosenDayNo={props.leadDayNo}
        stay={props.stay}
        onSelectStop={props.onPick}
      />
      <PlaceDotsLayer id="cp-places" places={props.dots} onSelectPlace={props.onPick} />
      {props.clusters.map((cluster) => (
        <ClusterBubble key={cluster.id} cluster={cluster} onPress={props.onCluster} />
      ))}
      {focused === null ? null : (
        <MapLabel
          lngLat={[focused.lng, focused.lat]}
          title={upper(focused.name, i18n.locale)}
          subtitle={upper(props.labelSubtitle, i18n.locale)}
          lift={18}
          testID="places-map-label"
        />
      )}
    </>
  );
}
