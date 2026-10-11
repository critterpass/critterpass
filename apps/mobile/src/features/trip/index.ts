/** The trip area's public entry for other features: the hub's tile registry and its compact row. */
export { HubTile, registerHubTile, useRegisteredHubTiles, type HubTileProps } from './hub/tiles';
export { NextRow, type HubNext } from './hub/next-row';
export {
  crewAccent,
  guideCritterKind,
  IconTile,
  LineIcon,
  tripZoomId,
  turn,
  type LineIconName,
} from './premium';
// The saved trip days behind the premium Offline page (You · Storage): what is saved, refreshing
// and removing it, and the auto-download preference.
export { AUTO_ID, AUTO_SQL, autoDownloadOn, PREFS_KIND } from './bundle/background-prefetch';
export {
  BUNDLE_KIND,
  parseSavedDay,
  refreshTripDays,
  removeTripDays,
  type RefreshOutcome,
  type SavedDay,
} from './bundle/bundle-manager';
export { useTripDayServices } from './bundle/services';
export type { SavedTrip } from './bundle/storage-settings';
