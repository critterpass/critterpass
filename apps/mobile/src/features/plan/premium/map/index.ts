// The premium map (4.25–4.39), shared with the crew map on the trip: one light or night style, the
// day colours, the sheet's detents and the plan's route and pin layers.
export { dayColours, EMPTY_DAY } from './day-colours';
export type { DayColours } from './day-colours';
export {
  cameraPadding,
  CHROME_BOTTOM,
  FULL_TOP,
  HALF_VISIBLE,
  PEEK_VISIBLE,
  settleDetent,
  sheetHeight,
} from './detents';
export type { CameraPadding, MapDetent } from './detents';
export { MAP_MARKS, MAP_PALETTES } from './palette';
export type { MapMarks, MapMode, MapPalette } from './palette';
export { PlanRouteLayer } from './plan-route-layer';
export type { PlanRouteLayerProps } from './plan-route-layer';
export { PremiumMapCanvas } from './premium-map-canvas';
export type { MapRegion, PremiumMapCanvasProps } from './premium-map-canvas';
export { premiumMapStyle } from './premium-map-style';
export { boatArc, dayLegs, planMapFeatures, traceLegs } from './route-features';
export type { Coord, LegMode, MapDay, MapStop } from './route-features';
export { StayFlag } from './stay-flag';
export type { StayFlagProps } from './stay-flag';
