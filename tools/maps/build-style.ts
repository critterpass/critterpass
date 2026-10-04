/**
 * Generates `apps/mobile/assets/map-style/critterpass-dark.json` from `@cp/design-tokens` (navy
 * base, ink/paper scale, blue water, motion-adjacent doodle grid) — the hand-drawn dark style the
 * map spec names. Generalises `tools/spikes/tiles/style/da-nang-dark.json` (the tiles spike's hand-authored
 * draft, hand-verified against the real OpenMapTiles schema a planetiler build produces) from one
 * hard-coded city to two real, distinct vector schemas:
 *
 * - `region`: OpenMapTiles schema (planetiler's bundled default profile, same as the spike), used
 *   for the 6 guide destinations' full-detail packs and the 55 guest-guide city-bbox packs
 *   (`build-pmtiles.ts` region mode). `CpMap` swaps this source's `url` at runtime per loaded
 *   destination — the value baked in here is only a placeholder default (see below).
 * - `world`: Protomaps Basemap schema (`boundaries, buildings, earth, landcover, landuse, places,
 *   pois, roads, water` — read from a real build's own `pmtiles show --metadata`, not guessed),
 *   the low-zoom (z0-8) global fallback `build-pmtiles.ts --world` extracts from Protomaps' public
 *   daily planet build via `pmtiles extract` (no OSM planet download needed — infeasible on this
 *   machine's disk budget, see the tools/maps README).
 *
 * Curated POI pins are NOT drawn from either vector source's own `poi` layer: `apps/mobile/src/ui/
 * map/DoodlePin.tsx` (T7a) renders them as React overlays from `/v1/places/search` data, styled
 * with our own category icon sprite. The base style only needs enough of its own `poi`/`places`
 * layers for incidental map flavour (street furniture, place-name labels), not the product's pins.
 */
import { tokens } from '@cp/design-tokens';
import {
  validateStyleMin,
  type ExpressionSpecification,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export const TILES_PUBLIC_BASE_URL = 'https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev';

/** Bootstrap-only default for the `region` source; `CpMap` always replaces it before first paint. */
const DEFAULT_REGION_PLACEHOLDER = `pmtiles://${TILES_PUBLIC_BASE_URL}/kyoto/tiles-v1.pmtiles`;

const ARCHIVO_FONT = 'Archivo-W100-700 Regular';
/** Hand-drawn place names. Borel covers Latin and every Vietnamese letter ("Đà Nẵng"). */
const HAND_DRAWN_FONT = 'Borel-400 Regular';
/** Borel has no macron vowels; Caveat does, so romanised Japanese names ("Ōtsu") draw in it. */
const HAND_DRAWN_MACRON_FONT = 'Caveat-600 Regular';
const MACRON_VOWELS = ['Ā', 'ā', 'Ē', 'ē', 'Ī', 'ī', 'Ō', 'ō', 'Ū', 'ū'] as const;

/**
 * The fontstack for a hand-drawn label, chosen per feature from the same text the layer draws.
 * Each branch is a single-font stack, so the bucket's `{fontstack}/{range}.pbf` files serve both.
 */
export function handDrawnFont(textField: ExpressionSpecification): ExpressionSpecification {
  const text: ExpressionSpecification = ['coalesce', textField, ''];
  return [
    'case',
    ['any', ...MACRON_VOWELS.map((vowel): ExpressionSpecification => ['in', vowel, text])],
    ['literal', [HAND_DRAWN_MACRON_FONT]],
    ['literal', [HAND_DRAWN_FONT]],
  ];
}

export function buildCritterpassDarkStyle(): StyleSpecification {
  const mapBase = tokens.color.map.base;
  const parksWater = tokens.color.map.parksWater;
  const water = tokens.color.blue;
  const ink800 = tokens.color.ink[800];
  const ink700 = tokens.color.ink[700];
  const ink600 = tokens.color.ink[600];
  const ink400 = tokens.color.ink[400];
  const ink100 = tokens.color.ink[100];
  const paperBright = tokens.color.paper.bright;

  const style: StyleSpecification = {
    version: 8,
    name: 'Critterpass dark',
    sources: {
      world: {
        type: 'vector',
        url: `pmtiles://${TILES_PUBLIC_BASE_URL}/world/tiles-v1.pmtiles`,
      },
      region: { type: 'vector', url: DEFAULT_REGION_PLACEHOLDER },
    },
    glyphs: `${TILES_PUBLIC_BASE_URL}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${TILES_PUBLIC_BASE_URL}/sprite/sprite`,
    layers: [
      // A solid base in the app's own surface colour, so a map whose sprite or tiles have not
      // loaded (slow network, none) never clears to black; the grid pattern draws over it.
      {
        id: 'background-base',
        type: 'background',
        paint: { 'background-color': tokens.semantic.bg.base },
      },
      { id: 'background', type: 'background', paint: { 'background-pattern': 'grid-tile' } },

      // --- world (Protomaps Basemap schema): low-zoom fallback everywhere, z0-8 only ---
      {
        id: 'world-earth',
        type: 'fill',
        source: 'world',
        'source-layer': 'earth',
        maxzoom: 9,
        paint: { 'fill-color': mapBase },
      },
      {
        id: 'world-water',
        type: 'fill',
        source: 'world',
        'source-layer': 'water',
        maxzoom: 9,
        paint: { 'fill-color': water, 'fill-opacity': 0.35 },
      },
      {
        id: 'world-boundaries',
        type: 'line',
        source: 'world',
        'source-layer': 'boundaries',
        maxzoom: 9,
        paint: { 'line-color': ink600, 'line-width': 0.75, 'line-dasharray': [3, 2] },
      },
      {
        id: 'world-places',
        type: 'symbol',
        source: 'world',
        'source-layer': 'places',
        maxzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': handDrawnFont(['get', 'name']),
          'text-size': ['interpolate', ['linear'], ['zoom'], 0, 8, 8, 16],
        },
        paint: { 'text-color': paperBright, 'text-halo-color': mapBase, 'text-halo-width': 1.5 },
      },

      // --- region (OpenMapTiles schema): full detail once a destination pack is loaded ---
      {
        id: 'region-landcover',
        type: 'fill',
        source: 'region',
        'source-layer': 'landcover',
        paint: { 'fill-color': ink800, 'fill-opacity': 0.6 },
      },
      {
        id: 'region-landuse',
        type: 'fill',
        source: 'region',
        'source-layer': 'landuse',
        paint: { 'fill-color': ink700, 'fill-opacity': 0.5 },
      },
      {
        id: 'region-park',
        type: 'fill',
        source: 'region',
        'source-layer': 'park',
        paint: { 'fill-color': parksWater, 'fill-opacity': 0.5 },
      },
      {
        id: 'region-waterway',
        type: 'line',
        source: 'region',
        'source-layer': 'waterway',
        paint: { 'line-color': water, 'line-opacity': 0.5, 'line-width': 1 },
      },
      {
        id: 'region-water',
        type: 'fill',
        source: 'region',
        'source-layer': 'water',
        paint: { 'fill-color': water, 'fill-opacity': 0.35 },
      },
      {
        id: 'region-building',
        type: 'fill',
        source: 'region',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': ink700, 'fill-outline-color': ink600 },
      },
      {
        id: 'region-boundary',
        type: 'line',
        source: 'region',
        'source-layer': 'boundary',
        filter: ['>=', ['get', 'admin_level'], 2],
        paint: { 'line-color': ink600, 'line-width': 0.75, 'line-dasharray': [3, 2] },
      },
      {
        id: 'region-transportation-minor',
        type: 'line',
        source: 'region',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path', 'track']]],
        paint: { 'line-color': ink400, 'line-width': 0.75, 'line-opacity': 0.6 },
      },
      {
        id: 'region-transportation-major',
        type: 'line',
        source: 'region',
        'source-layer': 'transportation',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
        ],
        paint: {
          'line-color': ink100,
          'line-opacity': 0.45,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 3],
        },
      },
      {
        id: 'region-poi',
        type: 'symbol',
        source: 'region',
        'source-layer': 'poi',
        minzoom: 16,
        layout: { 'icon-image': 'pin-other', 'icon-size': 0.6 },
        paint: { 'icon-opacity': 0.5 },
      },
      {
        id: 'region-transportation-name',
        type: 'symbol',
        source: 'region',
        'source-layer': 'transportation_name',
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': [ARCHIVO_FONT],
          'text-size': 11,
        },
        paint: { 'text-color': ink100, 'text-halo-color': mapBase, 'text-halo-width': 1 },
      },
      {
        id: 'region-place-city',
        type: 'symbol',
        source: 'region',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': handDrawnFont(['coalesce', ['get', 'name:latin'], ['get', 'name']]),
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 12, 20],
        },
        paint: { 'text-color': paperBright, 'text-halo-color': mapBase, 'text-halo-width': 1.5 },
      },
      {
        id: 'region-place-village',
        type: 'symbol',
        source: 'region',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb', 'hamlet']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': [ARCHIVO_FONT],
          'text-size': 12,
        },
        paint: { 'text-color': ink100, 'text-halo-color': mapBase, 'text-halo-width': 1 },
      },
    ],
  };
  return style;
}

/** Validates against the real MapLibre style spec — fails loudly on a malformed layer/paint value
 *  rather than shipping a style that only "looked right" by inspection. */
export function validateCritterpassDarkStyle(style: StyleSpecification): void {
  const errors = validateStyleMin(style);
  if (errors.length > 0) {
    const details = errors.map((error) => error.message);
    throw new Error(`tiles style: invalid style spec:\n  ${details.join('\n  ')}`);
  }
}

function main(): void {
  const style = buildCritterpassDarkStyle();
  validateCritterpassDarkStyle(style);
  const outPath = path.resolve(
    import.meta.dirname,
    '../../apps/mobile/assets/map-style/critterpass-dark.json',
  );
  writeFileSync(outPath, `${JSON.stringify(style, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify({ msg: 'tiles style: written', outPath, layers: style.layers.length }),
  );
}

if (import.meta.main) main();
