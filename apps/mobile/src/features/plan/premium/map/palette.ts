/**
 * The premium map's two looks (design `bali-map.html`): a light cream-and-blue map and its night
 * variant, used by every map in the premium app. Map colours are style data for MapLibre, not UI
 * tokens: they paint tiles, never views.
 */
export type MapMode = 'light' | 'night';

export interface MapPalette {
  readonly sea: string;
  readonly land: string;
  readonly coast: string;
  readonly green: string;
  readonly lake: string;
  /** Main roads: casing, then fill. Below zoom 11 the light map uses the far-out pair. */
  readonly mainCasing: string;
  readonly mainFill: string;
  readonly mainCasingFar: string;
  readonly mainFillFar: string;
  /** Local roads: casing, then fill. */
  readonly localCasing: string;
  readonly localFill: string;
  readonly label: string;
  readonly labelBold: string;
  readonly labelHalo: string;
  readonly peak: string;
  /** The halo under every route line. */
  readonly routeCasing: string;
}

export const MAP_PALETTES: Readonly<Record<MapMode, MapPalette>> = {
  light: {
    sea: '#cfe3f1',
    land: '#f4f1e8',
    coast: '#e6e1d3',
    green: '#e4ecd6',
    lake: '#cfe3f1',
    mainCasing: '#e8d9a8',
    mainFill: '#fff6d8',
    mainCasingFar: '#e2dccb',
    mainFillFar: '#ffffff',
    localCasing: '#e4dfd0',
    localFill: '#ffffff',
    label: '#6e6a5c',
    labelBold: '#4d4a40',
    labelHalo: '#f4f1e8',
    peak: '#b8b09a',
    routeCasing: '#ffffff',
  },
  night: {
    sea: '#121b26',
    land: '#1d2026',
    coast: '#2b2f37',
    green: '#1c2620',
    lake: '#16222e',
    mainCasing: '#3b3f48',
    mainFill: '#4c505a',
    mainCasingFar: '#3b3f48',
    mainFillFar: '#4c505a',
    localCasing: '#2a2d34',
    localFill: '#353840',
    label: '#9a9daa',
    labelBold: '#c3c5cf',
    labelHalo: '#1d2026',
    peak: '#71747f',
    routeCasing: '#0e0f13',
  },
};

/** The boat leg's blue, the same in both looks. */
export const BOAT_BLUE = '#2f6fe0';
/** The ink of stay flags and the stay square. */
export const MAP_INK = '#1c1d24';
