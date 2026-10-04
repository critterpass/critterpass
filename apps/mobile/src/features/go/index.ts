/** GO: the route from here to a place, then directions in the phone's maps app. */
export { goHref } from './routes';
export type { GoTarget } from './data/go-place';
export {
  chosenMapsApp,
  defaultMapsApp,
  mapsAppFor,
  mapsDirectionsUrl,
  useChosenMapsApp,
  WALK_FIRST_MAX_M,
  type GoMode,
  type GoPlatform,
  type MapsApp,
} from './maps-handoff';
export { useMapsAppRow } from './maps-app-row';
export { goAirportLabel, useGoOffer, type GoOffer } from './use-go-offer';
