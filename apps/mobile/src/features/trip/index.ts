/** The trip area's public entry for other features: the hub's tile registry and its compact row. */
export { HubTile, registerHubTile, useRegisteredHubTiles, type HubTileProps } from './hub/tiles';
export { NextRow, type HubNext } from './hub/next-row';
export {
  crewAccent,
  guideCritterKind,
  guideCritterName,
  IconTile,
  LineIcon,
  tripZoomId,
  turn,
  type LineIconName,
} from './premium';
export { useDayPrefs, type DayPrefs } from './bundle/background-prefetch';
export {
  BUNDLE_KIND,
  parseSavedDay,
  refreshTripDays,
  removeTripDays,
  type RefreshOutcome,
  type SavedDay,
} from './bundle/bundle-manager';
export { useTripDayServices } from './bundle/services';
export type { SavedTrip } from './bundle/saved-trip';
